# Production Smoke Test Plan

**Document Purpose:** Non-destructive, high-value verification steps to be executed immediately following any staging or production deployment.  
**Scope:** Verifies build deployment, database connectivity, authentication, business workflows, error handling, and cross-device responsiveness without corrupting or deleting production data.

---

## Pre-Flight Checklist Before Running Smoke Tests

1. Confirm production domain is reachable via HTTPS.
2. Confirm reverse proxy (e.g. Nginx, Cloudflare) terminates TLS and forwards headers (`X-Forwarded-For`, `X-Forwarded-Proto`).
3. Ensure `.env` is loaded with strong, non-default `JWT_SECRET`, `SESSION_SECRET`, and correct `CORS_ORIGIN`.
4. Ensure default demo credentials (`admin@mohsinco.com / changeme123`) have been rotated or disabled.

---

## Smoke Test Matrix

### 1. Health & Build Integrity Check
- **Action:** Perform HTTP GET on `/api/auth/me` without headers.
- **Expected Result:** HTTP 401 Unauthorized with JSON `{ "error": "Authentication required" }`.
- **Validation:** Confirms Express server is operational and JSON error handler is functional (no raw HTML or 500 error).

### 2. Login Workflow
- **Action:** Navigate to the production login page (`/`). Enter production administrator credentials and submit.
- **Expected Result:**
  - HTTP 200 OK received from `POST /api/auth/login`.
  - Response contains JWT token and user payload.
  - Browser redirects cleanly to `/` mounting the Executive Dashboard (`h2: DASHBOARD`).
  - No default credentials displayed in helper text.

### 3. Logout & Session Invalidation
- **Action:** Click "Sign Out" / User Avatar menu.
- **Expected Result:**
  - Token and user data removed from `localStorage`.
  - Browser redirects immediately to Login page.
  - Pressing browser "Back" button does not reveal authenticated cached views.

### 4. Authorization & Role Enforcement
- **Action:** Log in with a restricted account (e.g., Cashier or Operations Manager). Attempt to navigate to Settings (`/settings`) or make a direct API call to `POST /api/settings/users`.
- **Expected Result:** HTTP 403 Forbidden. UI hides administrative controls and displays unauthorized warnings.

### 5. Employee Directory & Safe Creation (Non-Destructive)
- **Action:**
  - View employee directory; verify table renders active employees with codes, departments, and avatars.
  - Create a designated smoke test employee (e.g. `SMOKE-TEST-EMP`, name `Smoke Verification User`, marked with department `Administration`).
- **Expected Result:**
  - HTTP 200 OK.
  - Employee appears immediately in table.
  - Unique employee code auto-assigned.

### 6. Attendance Verification & Live Ingestion
- **Action:**
  - Open Attendance roster for today. Verify current daily counts (Present, Late, Absent).
  - Apply a manual attendance entry or simulate a single test punch for the smoke test employee.
- **Expected Result:**
  - Attendance record created with valid timestamps.
  - Duration and status calculate accurately.
  - Second immediate punch within 5 minutes is debounced without zeroing hours.

### 7. Payroll Engine Dry Run
- **Action:** Navigate to Payroll view for current period. View existing records.
- **Expected Result:**
  - `GET /api/payroll/records` loads draft/approved records idempotently without altering timestamps or causing disk thrashing.
  - Net payouts reflect base salary, attendance deductions, and valid adjustments.

### 8. Financial Report Generation & Export
- **Action:** Navigate to Reports view. Generate a Monthly Attendance & Payroll Summary report. Click "Export Excel".
- **Expected Result:**
  - Browser downloads a valid `.xlsx` spreadsheet file.
  - Opening file shows formatted columns, headers, and totals matching on-screen figures.
  - Print payslip preview defangs any special characters without executing scripts.

### 9. Administrative Settings & Audit Logging
- **Action:** Open Audit Log in System Settings.
- **Expected Result:**
  - Displays recorded logs of recent login, employee creation, and report actions.
  - User names and roles match the operator.
  - No passwords or JWT tokens present in log details.

### 10. Database Write & Read Round-Trip
- **Action:** Update company address or contact in Company Settings. Refresh the browser page.
- **Expected Result:**
  - Change persists across refresh.
  - SQLite binary export updates `./data/payroll.sqlite` safely.

### 11. Error Handling & Security Boundary Check
- **Action:**
  - Send a malformed payload to `POST /api/attendance/override` with time `"invalid-hour"`.
  - Attempt 6 rapid bad logins from an external test script.
- **Expected Result:**
  - Zod validation returns HTTP 400 Bad Request with concise error message (no stack trace or internal paths).
  - Rate limiter blocks repeated bad logins with HTTP 429 "Too many login attempts".

### 12. Mobile & Cross-Browser Responsiveness
- **Action:** Open application on a mobile viewport (375x667) in Chrome and Safari.
- **Expected Result:**
  - Sidebar collapses into accessible hamburger navigation.
  - Tables switch to responsive horizontal scroll or card layout.
  - Buttons and inputs remain comfortably tappable (min 44px touch targets).

---

## Smoke Test Sign-Off Criteria

All 12 smoke tests must pass with **0 console errors**, **0 uncaught exceptions**, and **0 unauthorized data leaks**. If any test fails, deployment must immediately halt and execute the rollback plan.
