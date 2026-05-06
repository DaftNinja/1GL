# Auth Issues Debug Guide

## Issue 1: Registration Failure — "string did not match the expected pattern"

### Expected Fields (from server/auth/routes.ts:18-23)
```
email:     z.string().email() — must be valid email format
password:  z.string().min(8) — minimum 8 characters, NO special char requirement
firstName: z.string().min(1) — required, minimum 1 character
lastName:  z.string().min(1) — required, minimum 1 character
```

### What to Check
1. **Client is sending all 4 fields** — registration fails if firstName/lastName missing
   - ❌ Wrong: `{ email, password, username }`
   - ✅ Correct: `{ email, password, firstName, lastName }`

2. **Email domain is not personal** — these domains are BLOCKED:
   ```
   gmail.com, yahoo.com, hotmail.com, outlook.com, aol.com, icloud.com,
   mail.com, protonmail.com, zoho.com, yandex.com, live.com, msn.com,
   me.com, mac.com, googlemail.com
   ```

3. **Check server logs for validation errors:**
   ```
   [REGISTER] Request body: { email, firstName, lastName, password: '***' }
   [REGISTER] Validation error: [{ path, code, message }]
   [REGISTER] Field 'X' validation failed. Received: Y
   ```

### Test with Valid Data
```json
{
  "email": "testuser@yourcompany.com",
  "password": "Test123!@#",
  "firstName": "John",
  "lastName": "Doe"
}
```

---

## Issue 2: Password Reset — No Email Received

### SMTP Configuration Check
Verify these environment variables are set on Railway:
```
SMTP_HOST     = your-smtp-host (e.g., smtp.zoho.com)
SMTP_PORT     = 465  (or 587 for TLS)
SMTP_USER     = your-email@domain.com
SMTP_PASS     = your-app-password
```

### What to Look For in Logs

#### If email endpoint is called:
```
[FORGOT-PASSWORD] Request received: { email: 'user@company.com' }
[FORGOT-PASSWORD] Email validation passed: user@company.com
[FORGOT-PASSWORD] User lookup: FOUND
[FORGOT-PASSWORD] Reset URL: https://...
[FORGOT-PASSWORD] Sending email to: user@company.com
```

#### If email sends successfully:
```
[SMTP] Config: { host, port, user: '***' }
[SMTP] Sending password reset email to: user@company.com
[SMTP] Email sent successfully: { messageId, response }
```

#### If SMTP fails, you'll see:
```
[SMTP] Password reset email failed: {
  code: 'EAUTH',           // Authentication error
  errno: 535,              // SMTP error code
  syscall: 'write',        // System call that failed
  responseCode: 535,       // SMTP response code (535 = bad auth)
  response: '5.7.8 ...'    // Full SMTP error message
}
```

### Common SMTP Error Codes
- **535** - Invalid credentials (SMTP_USER/SMTP_PASS wrong)
- **530** - SMTP authentication required
- **550** - Recipient rejected (email address not valid on SMTP server)
- **ECONNREFUSED** - Can't connect to SMTP host
- **ETIMEDOUT** - Connection timeout
- **EAUTH** - Authentication failed

### Test Password Reset Flow
1. Submit forgot-password form with your work email
2. Check Railway logs immediately with grep:
   ```bash
   railway logs --num 200 | grep -E "\[FORGOT-PASSWORD\]|\[SMTP\]"
   ```
3. Verify these steps complete:
   - ✅ Email validation passed
   - ✅ User lookup found
   - ✅ Reset token created
   - ✅ Email sent successfully (OR specific SMTP error)

### Nodemailer Config (server/email.ts:13-18)
```typescript
{
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,  // Required for port 465
  auth: { user: SMTP_USER, pass: SMTP_PASS }
}
```

For **port 587 (TLS)**, change:
- `secure: false` → `secure: false` (StartTLS)
- Or use `port: 465` with `secure: true` (implicit SSL)

---

## Quick Diagnostic Command
```bash
# On Railway (if CLI available)
railway logs --num 200 | grep -E "\[REGISTER\]|\[FORGOT-PASSWORD\]|\[SMTP\]"
```

## Files Modified for Debugging
- `server/auth/routes.ts` — Enhanced registration & password reset logging
- `server/email.ts` — Detailed SMTP error logging with config validation
