# Request Timeout & Performance Debug Guide

## Issue Summary
- **ENTSO-E cross-border flows**: 2-3 minutes then timeout (499)
- **Password reset**: 2m 56s timeout
- **Login**: 401 errors (separate issue)

## Likely Root Causes

### 1. ENTSO-E API Rate Limiting (429)
**Symptom**: Repeated 429 responses causing exponential backoff retries
- Each 429 triggers: 8s, 16s, 24s delays = 48 seconds per pair max
- With ~100+ pairs and pLimit(3) concurrency = multiple pairs hitting 429
- Total: Could easily exceed 2-3 minutes

**What to check in logs:**
```
[ENTSOE A11 RETRY] X→Y: Got 429, sleeping 8000ms before retry 1/3
[ENTSOE A11 RATELIMIT] X→Y: rate limited after 3 retries
```

### 2. SMTP Connection Timeout
**Symptom**: Password reset hangs waiting for email send
- SMTP_HOST unreachable or slow
- Authentication failure with wrong credentials
- Connection timeout to mail server

**What to check in logs:**
```
[SMTP] Config: { host: ?, port: ?, user: ? }
[SMTP] Sending password reset email to: X
[SMTP] Email sent successfully: { messageId, response }
[SMTP] Password reset email failed: { code, errno, responseCode }
```

### 3. Database Query Timeouts
**Symptom**: Auth operations (user lookup, token creation) taking >10s
- Database connection pool exhausted
- Slow queries (missing indexes)
- Transaction locks

**What to check in logs:**
```
[FORGOT-PASSWORD] User lookup: FOUND/NOT_FOUND
[FORGOT-PASSWORD] Creating reset token, expires: X
```

---

## Log Analysis Guide

### Full Request Timeline
Each request logs **total elapsed time**:
```
[SLOW_API] GET /api/entsoe/cross-border-flows 200 in 156000ms
```

### Breakdown by Component

#### ENTSOE Fetch Performance
```
[ENTSOE] Request: /api/entsoe/cross-border-flows?hourOffset=0
[ENTSOE] Starting getCrossBorderFlows(0)...
[ENTSOE] cross-border-flows complete: 105 pairs, 42 non-zero, fetched in 45000ms
[ENTSOE] Response sent in 45050ms total
```

#### Per-Pair Timing (if >5 seconds)
```
[ENTSOE A11 SLOW] DE→FR: fetch=8120ms, parse=45ms, total=8165ms
```

#### Rate Limit Retries
```
[ENTSOE A11 RETRY] NL→BE: Got 429, sleeping 8000ms before retry 1/3
[ENTSOE A11 RETRY] NL→BE: Got 429, sleeping 16000ms before retry 2/3
[ENTSOE A11 RATELIMIT] NL→BE: rate limited after 3 retries, total time=48230ms
```

#### SMTP Diagnostics
```
[FORGOT-PASSWORD] Request received: { email: 'user@company.com' }
[SMTP] Config: { host: 'smtp.zoho.com', port: '465', user: '***' }
[SMTP] Sending password reset email to: user@company.com
[SMTP] Email sent successfully: { messageId: 'XXX', response: '250 OK' }
```

#### Slow Request Warning
```
[SLOW_REQUEST] POST /api/auth/forgot-password still pending after 30000ms
[SLOW_API] POST /api/auth/forgot-password 200 in 156000ms
```

---

## Diagnostic Procedure

### Step 1: Identify the Slow Endpoint
```bash
# Check which endpoint is causing the timeout
railway logs --num 500 | grep -E "\[SLOW_API\]|\[SLOW_REQUEST\]"
```

**Expected output** shows which endpoint timed out:
```
[SLOW_REQUEST] GET /api/entsoe/cross-border-flows still pending after 30000ms
[SLOW_API] GET /api/entsoe/cross-border-flows 200 in 156000ms
```

### Step 2: Check Component Timing

**For ENTSOE timeouts:**
```bash
railway logs --num 500 | grep -E "\[ENTSOE\]|\[ENTSOE A11\]" | tail -30
```

Look for:
- How many pairs were fetched? (should be ~105)
- How many took >5 seconds? (look for `[ENTSOE A11 SLOW]`)
- How many hit rate limits? (look for `[ENTSOE A11 RETRY]` and `[ENTSOE A11 RATELIMIT]`)
- Total fetch time? (look for `cross-border-flows complete in Xms`)

**For password reset timeouts:**
```bash
railway logs --num 500 | grep -E "\[FORGOT-PASSWORD\]|\[SMTP\]" | tail -30
```

Look for:
- Did email validation pass?
- Did user lookup complete?
- Did SMTP config load?
- Did email send succeed or fail?

### Step 3: Identify Root Cause

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `[ENTSOE A11 RATELIMIT]` appears frequently | ENTSO-E API rate limiting | Reduce request frequency or wait for ENTSO-E to recover |
| `[ENTSOE A11 SLOW]` shows 10-20s per pair | ENTSO-E API is slow | Normal in peak hours; no fix needed |
| `[SMTP] Password reset email failed: { code: 'EAUTH' }` | Wrong SMTP credentials | Verify `SMTP_USER` and `SMTP_PASS` on Railway |
| `[SMTP] ... { errno: 'ECONNREFUSED' }` | Can't connect to SMTP host | Verify `SMTP_HOST` and `SMTP_PORT` |
| `[FORGOT-PASSWORD] ... still pending after 30s` | Database or auth operation slow | Check database connection pool |

---

## Performance Baselines

These are healthy values:

| Endpoint | Expected Time | Warning Threshold |
|----------|---|---|
| `/api/entsoe/cross-border-flows` | 30-45s (cold), <5s (cached) | >60s |
| `/api/auth/forgot-password` | <2s (with email send) | >10s |
| `/api/auth/login` | <500ms | >2s |
| Single ENTSOE fetch (20s timeout) | 5-15s | >18s (close to timeout) |

---

## Railway Log Filtering

**Watch for timeouts in real-time:**
```bash
# Terminal 1: Watch for slow requests
railway logs --follow | grep -E "\[SLOW_REQUEST\]|\[SLOW_API\]"

# Terminal 2: Watch for ENTSOE issues
railway logs --follow | grep -E "\[ENTSOE A11\]|\[ENTSOE PERF\]"

# Terminal 3: Watch for SMTP issues
railway logs --follow | grep -E "\[SMTP\]|\[FORGOT-PASSWORD\]"
```

**Get last N lines of a specific error:**
```bash
# ENTSOE rate limits
railway logs --num 1000 | grep "RATELIMIT" | tail -10

# SMTP failures
railway logs --num 1000 | grep "SMTP.*failed" | tail -10

# Requests >30s
railway logs --num 1000 | grep "SLOW_REQUEST" | tail -10
```

---

## Code Changes for Debugging

Added to detect timeouts:

1. **Express middleware** (`server/index.ts:41-66`)
   - Warns if any request takes >30s
   - Flags API responses >10s as `[SLOW_API]`

2. **ENTSOE endpoint** (`server/routes.ts:1102-1143`)
   - Logs request start and total time
   - Logs time spent in `getCrossBorderFlows`

3. **fetchDirectionalFlow** (`server/entsoe.ts:1088-1149`)
   - Per-pair timing breakdown
   - 429 retry logging with backoff duration

4. **fetchEntsoe** (`server/entsoe.ts:173-215`)
   - HTTP fetch time separate from XML parsing time
   - Logs if either >10s / 5s respectively

5. **Password reset** (`server/auth/routes.ts:171-211`)
   - Logs each step of reset flow
   - Email sending duration

---

## Next Steps

1. **Reproduce the issue** — trigger password reset or ENTSOE fetch
2. **Watch logs immediately** — use the grep filters above
3. **Identify which log appears** — that points to the bottleneck
4. **Apply fix** based on the table above
5. **Monitor baseline** — run the endpoint again, should be faster

If rate limiting is the issue, consider:
- Reducing query frequency (cache longer)
- Spreading requests over time (stagger fetches)
- Using a smaller window (fewer pairs, fewer hours)
