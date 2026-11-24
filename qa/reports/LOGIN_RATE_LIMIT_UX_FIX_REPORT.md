# Login Rate-Limit UX Fix Report

**Date:** September 1, 2026  
**Author:** Antigravity Security Auditor  
**Status:** Fix prepared and tested. Not yet deployed.

---

## ROOT CAUSE

The `authLimiter` middleware in [`server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L91-L97) used the **default `express-rate-limit` key generator**, which keys solely on `req.ip`. This means:

1. All login attempts from the same IP address share **one** failure counter, regardless of which account is being targeted.
2. In a corporate NAT / shared-IP environment (such as Hostinger's reverse proxy topology where `TRUST_PROXY=1`), multiple legitimate users appear as one client.
3. Once **any** user (or attacker) exhausts 5 failed attempts from that IP, **every** user behind the same IP is locked out for 15 minutes — including the legitimate administrator.

The `skipSuccessfulRequests: true` flag was present but ineffective for this scenario: once the window's failure count reached the `max` threshold, the middleware short-circuits with 429 **before** the request reaches the login handler, so the successful-login codepath is never reached.

Additionally, [`verifyPassword`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/auth.ts#L41-L43) lacked a defensive null/type guard on the `hash` parameter. If a user record had a `null` password field (e.g., from the API-extracted backup), `bcryptjs.compare(string, null)` threw an unhandled `Error: Illegal arguments: string, object`, crashing the Node.js process.

---

## CURRENT LIMIT (Before Fix)

| Parameter | Value |
|---|---|
| Window | 15 minutes (`AUTH_RATE_LIMIT_WINDOW_MS=900000`) |
| Max failures per window | 5 (`AUTH_RATE_LIMIT_MAX=5`) |
| Key | IP address only (default `express-rate-limit` `ipKeyGenerator`) |
| Skip successful requests | Yes (`skipSuccessfulRequests: true`) |
| Successful login resets counter | No |

---

## CURRENT WINDOW

15 minutes (900,000 ms). Configurable via `AUTH_RATE_LIMIT_WINDOW_MS` environment variable.

---

## CURRENT CLIENT IDENTIFICATION

**IP only.** The default `express-rate-limit` key generator resolves to `req.ip`, which — with `TRUST_PROXY=1` on Hostinger — is the first `X-Forwarded-For` value from the CDN/proxy chain. All users behind the same corporate NAT share one bucket.

---

## PROXY IMPACT

Hostinger routes traffic through its CDN (`hcdn` / Cloudflare edge) and LiteSpeed Passenger reverse proxy. With `TRUST_PROXY=1`, `req.ip` correctly resolves to the true client IP (the first trusted hop). However, multiple office users behind the same corporate NAT gateway still share a single external IP, causing them to share a single rate-limit bucket.

---

## LEGITIMATE USER IMPACT

**High.** A legitimate administrator logging in after a coworker (or automated scanner) caused 5 failures from the same IP would receive `HTTP 429 Too Many Requests` for up to 15 minutes — even with correct credentials. This was the exact symptom reported.

---

## SECURITY RISK

The original IP-only limiter was too aggressive for UX but also too weak against credential spraying (an attacker cycling through many email addresses from one IP could try 5 passwords per account without triggering any cross-account protection).

---

## CHOSEN FIX

**Defense-in-depth dual-tier rate limiting with composite key and successful-login counter reset.**

### Tier 1: Account-Level Composite Key (`authLimiter`)
- **Key:** `IP + email` (composite via `ipKeyGenerator(req.ip) + '_' + email.toLowerCase()`)
- **Max:** 5 failed attempts per (IP, account) pair per 15-minute window
- **Effect:** Brute-forcing a specific account from a specific IP is throttled at exactly 5 attempts. A different user on the same IP has their own independent counter.

### Tier 2: Global IP Backstop (`authIpLimiter`)
- **Key:** IP only (default `express-rate-limit` behavior)
- **Max:** 30 failed attempts per IP per 15-minute window (configurable via `AUTH_IP_RATE_LIMIT_MAX`)
- **Effect:** Prevents horizontal credential spraying where an attacker cycles through many accounts from one IP. Still generous enough for a corporate NAT with up to ~6 legitimate users making ~5 mistakes each.

### Tier 3: Successful Login Counter Reset
- On successful authentication, `authLimiter.resetKey(getAuthAccountKey(req))` is called to clear the failure counter for that (IP, account) pair.
- This means a user who mistypes their password 4 times, then succeeds, starts fresh — they are not penalized by stale failure history.

### Middleware Chain
```
POST /api/auth/login → authIpLimiter → authLimiter → validateBody → handler
```

### Defensive `verifyPassword` Guard
- Added null/type guard: if `password` or `hash` is not a non-empty string, `verifyPassword` returns `false` instead of throwing.
- Added defensive check in login handler: if `user.password` is null or not a string, return 401.

---

## WHY FIX DOES NOT WEAKEN BRUTE-FORCE PROTECTION

1. **Per-account brute force is still limited to 5 attempts.** The composite key `IP_email` means an attacker targeting `admin@mohsinco.com` from a single IP is blocked after exactly 5 failures — identical to the previous behavior for single-target attacks.

2. **Horizontal spraying is bounded.** The global IP backstop at 30 failures per IP prevents an attacker from cycling through 30+ accounts. This is a new layer that did not exist before.

3. **`skipSuccessfulRequests: true` remains active on both limiters.** Successful logins do not count toward any limit.

4. **X-Forwarded-For cannot trivially bypass the limiter.** With `TRUST_PROXY=1`, Express only trusts the first proxy hop. Spoofed `X-Forwarded-For` headers from the client are appended by the CDN, not trusted as `req.ip`.

5. **The assertion `expect(status).toBe(429)` remains strict** in TC-SEC-03 and all test suites.

---

## TEST RESULTS

### Rate Limit UX Verification (`tests/rate_limit_ux_verification.mjs`)
| # | Test | Result |
|---|---|---|
| 1 | Single failed login → 401 | **PASS** |
| 2 | 5 failures + 6th attempt → 429 (strict) | **PASS** |
| 3 | Different user on same NAT IP NOT blocked | **PASS** |
| 4 | Successful login resets counter | **PASS** |
| 5 | Global IP spray blocked at attempt 31 | **PASS** |
| 6 | Old dev fallback JWT rejected → 401 | **PASS** |
| 7 | Production JWT authenticates → 200 | **PASS** |
| 8 | RBAC enforced → 403 | **PASS** |

### Release Blockers (`tests/release_blockers.mjs`)
- **11/11 PASS** (0 failures)

### P0 Adversarial Attacks (`tests/p0_adversarial_attack.mjs`)
- **3/3 PASS** (0 failures)

### Full Playwright E2E Suite
- **17/17 PASS** (25.7s, TC-SEC-03 strict 429 assertion intact)

### TypeScript Typecheck (`tsc --noEmit`)
- **0 errors**

### Production Build (`node build.js`)
- **Success** (Vite 6 frontend + esbuild backend)

---

## SHARE-MODAL ROOT CAUSE

The browser error:
```
share-modal.js:1 Uncaught TypeError: Cannot read properties of null (reading 'addEventListener')
```

**This file does not belong to the application.** Investigation confirms:
- `share-modal.js` is not present in the application source (`src/`), build output (`dist/`), index.html, or any project dependency.
- No reference to `share-modal`, `shareModal`, or any share modal component exists in the codebase (`rg` search returned 0 results).
- The file is not in the Hostinger `public_html` document root (only `.htaccess` is present per `hosting_listWebsiteFilesAndDirectoriesV1`).

**Conclusion:** `share-modal.js` is injected by the **Hostinger hPanel toolbar** or a **browser extension**. Hostinger's shared hosting platform injects a small JavaScript widget for site-sharing functionality into served pages. When the expected DOM elements for the sharing widget are absent (as in a single-page React application), the script throws because it calls `addEventListener` on a `null` element.

---

## SHARE-MODAL FIX

**No application code change required.** The error originates from external infrastructure (Hostinger toolbar injection), not application code. Possible mitigations if the error is disruptive:

1. **Hostinger hPanel setting:** Disable the "Hostinger toolbar" or "site preview toolbar" in hPanel → Website → Advanced settings.
2. **CSP enforcement:** The application's existing Content-Security-Policy (`script-src 'self' 'unsafe-inline'`) should block externally-sourced scripts if Hostinger injects them from a different origin. If the script is injected inline or from the same origin, it would pass CSP.

No code modification was made for this issue.

---

## FINAL STATUS

| Item | Status |
|---|---|
| Rate-limit UX fix | **IMPLEMENTED & TESTED** |
| Brute-force protection | **PRESERVED** (5 per account, 30 per IP) |
| Successful-login reset | **IMPLEMENTED** |
| NAT user isolation | **IMPLEMENTED** (composite IP+email key) |
| Credential spray defense | **NEW** (global IP backstop) |
| `verifyPassword` crash fix | **IMPLEMENTED** (null guard) |
| Share-modal error | **NOT APPLICATION CODE** (Hostinger toolbar) |
| TypeScript | **0 errors** |
| Build | **SUCCESS** |
| Playwright | **17/17 PASS** |
| Release blockers | **11/11 PASS** |
| P0 adversarial | **3/3 PASS** |
| Rate limit regression | **8/8 PASS** |

**Ready for deployment review. Not yet deployed.**
