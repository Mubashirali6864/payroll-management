# Production Deployment Checklist

**Evaluation Date:** September 1, 2026  
**Auditor:** Antigravity Independent Security Auditor  
**System:** Mohsin & Co — Payroll & Attendance Management System  
**Environment Target:** Production Host (Hostinger Cloud / VPS / Linux Node.js)

---

## 1. Environment & Cryptographic Secrets

| Verification Item | Status | Technical Details | Action Required |
| :--- | :--- | :--- | :--- |
| **Production `JWT_SECRET` Configured** | **VERIFIED** | High-entropy 32-character string configured in `.env`. Server fails closed if empty, `< 32` characters, or containing `'dev-secret'`. | Generate unique secret per host via `openssl rand -hex 32`. |
| **`JWT_SECRET` Git Tracking** | **VERIFIED** | Excluded in `.gitignore` (`.env*` excluded, only `!.env.example` tracked). No secrets committed. | Ensure `.env` is never added to git on production server. |
| **Development Secret Fallback Guard** | **VERIFIED** | `src/auth.ts:18` strictly blocks `'dev-secret-change-in-production'`. Fails process before listening. | None. Application fails closed. |
| **Session Secret** | **VERIFIED** | High-entropy 32-character string in `.env`. | Ensure set in host `.env`. |
| **CORS Production Origin** | **VERIFIED** | Bound to production domain in `.env` (`CORS_ORIGIN`). Wildcards (`*`) with credentials disallowed. | Confirm matches exact live production FQDN. |

---

## 2. Database & Filesystem

| Verification Item | Status | Technical Details | Action Required |
| :--- | :--- | :--- | :--- |
| **Database File Path** | **VERIFIED** | SQLite binary stored at `./data/payroll.sqlite`. Loaded via `sql.js` WebAssembly and written atomically via `fs.writeFileSync`. | Ensure `./data` directory exists and has persistent storage. |
| **Database File Permissions** | **OPERATIONAL REQUIREMENT** | File mode must be restricted to the Node process user (e.g. `chmod 660 ./data/payroll.sqlite`). | Run `chmod 770 ./data && chmod 660 ./data/payroll.sqlite` on deployment. |
| **Demo Admin Removal & Migration** | **VERIFIED** | Seeding script contains 0 default accounts. Migration purges default passwords while preserving legitimate admins. | Run first-run setup wizard on fresh deploy. |

---

## 3. Reverse Proxy & Network Security

| Verification Item | Status | Technical Details | Action Required |
| :--- | :--- | :--- | :--- |
| **Intended Architecture** | **DOCUMENTED** | `Internet` → `Reverse Proxy (Nginx / Hostinger)` → `Node/Express (0.0.0.0:3000)`. | Terminate TLS at reverse proxy. |
| **Express `trust proxy` Setting** | **VERIFIED** | Conditionally enabled via `TRUST_PROXY=1` in `server.ts:48-53` (`app.set('trust proxy', 1)`). | Keep `TRUST_PROXY=1` when behind single reverse proxy. |
| **Proxy Header Sanitization** | **UNKNOWN — REQUIRES HOST VERIFICATION** | If proxy does not overwrite incoming `X-Forwarded-For`, clients can spoof IPs to evade `authLimiter`. | Configure Nginx: `proxy_set_header X-Forwarded-For $remote_addr;` |
| **HTTPS / TLS Configuration** | **OPERATIONAL REQUIREMENT** | Express server listens over HTTP (`0.0.0.0:3000`). Upstream proxy must terminate SSL and redirect HTTP → HTTPS. | Enable SSL certificate (e.g., Let's Encrypt / Hostinger SSL) and enforce 301 HTTPS redirect. |
| **Rate Limiting Behavior** | **VERIFIED** | Global API: 2,000 req/15 min. Auth (`/api/auth/login`): 5 failed attempts/15 min. 6th attempt strictly returns HTTP 429. | Monitor memory usage in production. |

---

## 4. Application Runtime & Process Management

| Verification Item | Status | Technical Details | Action Required |
| :--- | :--- | :--- | :--- |
| **Node.js Runtime Version** | **VERIFIED** | Runtime: Node.js `v24.12.0` (LTS/Current). Compatible with ES Modules and `sql.js`. | Target Node.js `>= 20.x` on production host. |
| **Process Manager (PM2 / Systemd)** | **OPERATIONAL REQUIREMENT** | Daemon requires supervisor to auto-restart on crash or server reboot. | Configure PM2: `pm2 start dist/server.js --name payroll-app` or systemd service unit. |
| **Deployment Start Command** | **VERIFIED** | `node dist/server.js` (executes pre-built bundle). | Use `npm start` (`node dist/server.js`). |
| **Logging & Error Handling** | **VERIFIED** | Business actions logged to `audit_logs` SQLite table. Sensitive tokens and passwords are excluded from logs. Global error handler intercepts uncaught exceptions. | Redirect stdout/stderr to rotating log files (`/var/log/payroll/`). |

---

## 5. Host Backup & Recovery

| Verification Item | Status | Technical Details | Action Required |
| :--- | :--- | :--- | :--- |
| **Scheduled Backup Cron** | **UNKNOWN — REQUIRES HOST VERIFICATION** | SOP authored in [`qa/reports/DATABASE_BACKUP_RUNBOOK.md`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/qa/reports/DATABASE_BACKUP_RUNBOOK.md). No host cron currently active in repository environment. | Install backup script to `/usr/local/bin/backup-payroll.sh` and configure daily cron. |
| **Offsite Replication & Integrity** | **UNKNOWN — REQUIRES HOST VERIFICATION** | Runbook specifies compressed GPG encrypted copy to S3/B2 storage. | Verify cloud storage credentials and test restore drill before launch. |
