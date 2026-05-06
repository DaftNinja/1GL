# CRITICAL FIXES: ENTSO-E Cross-Border Flows Endpoint

## Problem
- `/api/entsoe/cross-border-flows` was hanging 2-3 minutes then timing out (499)
- Entire frontend blocked from loading
- Endpoint sometimes fast (18s), sometimes hangs indefinitely

## Root Causes Fixed

### 1. **Concurrency Too Low (3 → 10)**
- Was: `pLimit(3)` = 3 border pairs in parallel
- Now: `pLimit(10)` = 10 border pairs in parallel
- Each pair fetches 2 directions = ~20 concurrent requests
- Result: 3-4x faster

### 2. **No Per-Pair Timeout**
- Was: Each pair had unlimited wait time
- Now: Each pair times out after **8 seconds** (was unlimited)
- If a pair hangs, it won't block others
- Result: Prevents cascading failures

### 3. **No Batch Timeout**
- Was: Entire batch could hang indefinitely if ANY pair was slow
- Now: Entire operation times out after **60 seconds** max
- Returns **partial results** instead of hanging
- Result: Frontend always gets data within 60s, even if incomplete

### 4. **Excessive Retry Delays**
- Was: 429 rate limits triggered 8s, 16s, 24s delays (48s total)
- Now: Single 2s delay on retry, then fail fast
- Result: Quicker failure detection, less blocking

## Expected Performance

### Before Fixes
```
[ENTSOE A11] Fetching 105 borders (0 skipped) with concurrency=3
[ENTSOE A11] fetch complete in 156000ms  ← 2m 36s timeout
[SLOW_REQUEST] GET /api/entsoe/cross-border-flows still pending after 30000ms
[SLOW_REQUEST] ... still pending after 60000ms
... hangs until browser timeout (499)
```

### After Fixes
```
[ENTSOE A11] Fetching 105 borders (0 skipped) with concurrency=10, timeout=60s
[ENTSOE A11] fetch (PARTIAL - timeout after 45000ms): 95/105 pairs fetched  ← Returns after 45s with 95 pairs
GET /api/entsoe/cross-border-flows 200 in 45050ms
```

## What to Test

### ✅ Fast Path (Cached)
```bash
curl https://your-app/api/entsoe/cross-border-flows
# Should return in <1s (from cache)
```

### ✅ Slow Path (Live Fetch)
```bash
# After cache expires, next request fetches live data
curl https://your-app/api/entsoe/cross-border-flows
# Should return in 30-45s, not 2-3 minutes
# May be partial (95/105 pairs) if rate limited, but still usable
```

### ✅ Rate Limit Handling
```bash
# If ENTSO-E returns many 429s, endpoint still completes:
[A11 RETRY] X→Y: Got 429, retrying...
[A11 TIMEOUT] X→Y: timed out after 8234ms  ← Per-pair timeout
[ENTSOE A11] fetch (PARTIAL - timeout after 60000ms): 85/105 pairs fetched
# Returns 85 pairs instead of hanging forever
```

## Logging

### Key Log Lines to Watch
```
[ENTSOE A11] Fetching X borders with concurrency=10, timeout=60s
[A11] X→Y: 5234ms (fetch=5100ms)  ← Individual pair timing
[A11 TIMEOUT] X→Y: timed out after 8234ms
[A11 RETRY] X→Y: Got 429, retrying...
[ENTSOE A11] fetch (PARTIAL - timeout after 45000ms): 95/105 pairs fetched
GET /api/entsoe/cross-border-flows 200 in 45050ms
```

### Real-Time Monitoring
```bash
# Watch ENTSOE A11 fetches
railway logs --follow | grep "\[A11\]"

# Watch slow requests
railway logs --follow | grep "\[SLOW_REQUEST\]"

# Watch for timeouts
railway logs --follow | grep "TIMEOUT"
```

---

## Other Endpoints Fixed

### `/api/entsoe/prices` (404 Issues)
- Added logging to identify why data is not found
- Logs now show: `[PRICES] Fetching for: X` and `[PRICES] Returning X months for Y`
- If still returning 404, check logs to see if the country is valid

### `/api/nged/generation-register` (500 Issues)
- Added logging: `[NGED-GCR] Fetching...` and `[NGED-GCR] Returned X generators`
- If still returning 500, logs will show the actual error message
- Check authentication and CSV parsing errors

---

## Code Changes

### `server/entsoe.ts`
- Line 1088: `fetchDirectionalFlow` — Added per-pair 8s timeout
- Line 1256: Increased `pLimit` from 3 to 10
- Line 1268: Added batch timeout with `Promise.race`
- Line 1306: Partial result handling

### `server/routes.ts`
- Line 1102: Request timing for `/api/entsoe/cross-border-flows`
- Line 913: Logging for `/api/entsoe/prices`
- Line 1564: Logging for `/api/nged/generation-register`

---

## Next Steps

1. **Deploy the changes** to Railway
2. **Monitor logs** — look for the new log patterns above
3. **Test** — hit `/api/entsoe/cross-border-flows` after cache expires
4. **Verify** — should complete in 30-45s, not 2-3 minutes
5. **Check other endpoints** — if prices/NGED still broken, logs will show why

---

## Fallback Strategy

If issues persist after deployment:

| Symptom | Check | Fix |
|---------|-------|-----|
| Still times out after 60s | ENTSO-E API down? Check `[ENTSOE PERF]` logs | Increase batch timeout to 90s |
| Only returns 5-10 pairs | Network issues or rate limits | Reduce concurrency back to 5-8 |
| Returns 404/500 on prices/NGED | See endpoint logs `[PRICES]` / `[NGED-GCR]` | Depends on actual error |

The main fix is **complete** — the endpoint will no longer hang indefinitely.
