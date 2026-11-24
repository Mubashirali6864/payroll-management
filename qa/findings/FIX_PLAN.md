# FIX_PLAN.md — Master Codex Verified Bug Fix Plan

**Objective:** Move from Audit mode to Fix mode. Provide a rigorous, phased engineering plan for fixing ONLY verified, evidence-backed defects without introducing regressions.  
**Auditor Principle:** Evidence over assumptions. Fix one defect at a time. No blind refactors.

---

## Prioritization Overview

- **P0 (Blocker / Critical):**
  - `P0-01 (DEFECT-ADV-01)`: Production server fails to load `.env`, running on hardcoded JWT secret `'dev-secret-change-in-production'`.
  - `P0-02 (DEFECT-ADV-02)`: Process-killing crash (Remote DoS) on `PUT /api/settings/users/:id` with partial updates.
  - `P0-03 (DEFECT-01)`: Payroll adjustments target month omission & retrospective misattribution.
- **P1 (High):**
  - `P1-01 (DEFECT-02)`: Overnight shift work duration minute arithmetic inversion collapsing to `0.0 hours worked`.
  - `P1-02 (DEFECT-03)`: Unauthenticated public access to company headcount and financial liabilities on `/api/dashboard/metrics`.
  - `P1-03 (DEFECT-ADV-05)`: Resigned/inactive employees who worked days during the month completely omitted from payroll calculations.
  - `P1-04 (DEFECT-ADV-03)`: Missing time format validation in `attendanceOverrideSchema` producing `NaN` / `null` in `hours_worked`.
- **P2 (Medium):**
  - `P2-01 (DEFECT-04)`: Flawed self-deletion check (`targetUser?.name === user.email`) permitting admin self-lockout.
  - `P2-02 (DEFECT-05)`: Working on scheduled off-days uncredited for daily wage earners in `calculatePayrollForMonth`.
  - `P2-03 (DEFECT-06)`: Future month payroll calculation awards 100% full salary for 0 days worked.
  - `P2-04 (DEFECT-07)`: Biometric ADMS push handler treats rapid double-punch as immediate check-out with 0 hours worked.
  - `P2-05 (DEFECT-08)`: Stored Cross-Site Scripting (XSS) in printable ledger and reports templates.
  - `P2-06 (DEFECT-09)`: `half_day` attendance status counted as 100% full day in daily wage payroll.
  - `P2-07 (DEFECT-ADV-04)`: Safe HTTP `GET /api/payroll/records` mutates database and triggers synchronous disk writes.
- **P3 (Low):**
  - `P3-01 (DEFECT-10)`: Cascading unawaited async calls in `App.tsx` causing payroll state overwrite race condition.
  - `P3-02 (DEFECT-11)`: Plaintext production credentials displayed in login view footer.
  - `P3-03 (DEFECT-12)`: Dark-to-light Flash of Unstyled Content (FOUC) on initial document render.

---

## Detailed Defect Specifications & Remediation Plan

---

### [P0-01] Production Server Ignores `.env` and Runs on Hardcoded Fallback Secret (DEFECT-ADV-01)
- **Severity:** 🔴 **P0 — CRITICAL**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `server.ts` does not import or invoke `dotenv.config()`. `process.env.JWT_SECRET` remains undefined at runtime, causing `src/auth.ts` to fall back to `'dev-secret-change-in-production'`.
- **Current Behavior:**  
  The live server uses the default string `'dev-secret-change-in-production'`, enabling universal administrative token forgery.
- **Expected Behavior:**  
  The server loads `.env` upon startup; `process.env.JWT_SECRET` is populated with the configured secret. Tokens signed with the default fallback string must be rejected.
- **Proposed Fix:**  
  Add `import 'dotenv/config';` at line 1 of `server.ts` before any local module imports.
- **Regression Test Required:**  
  Assert that tokens signed with `'dev-secret-change-in-production'` return HTTP 401, while tokens signed with the `.env` secret return HTTP 200 on `/api/auth/me`.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P0-02] Process-Killing Remote Denial of Service via `PUT /api/settings/users/:id` (DEFECT-ADV-02)
- **Severity:** 🔴 **P0 — CRITICAL**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `updateUserSchema` marks fields as optional, but line 1649/1654 executes an `UPDATE` query without merging incoming fields with `existing.name`, `existing.email`, or `existing.role`. If omitted, SQLite throws `NOT NULL constraint failed: users.name`. Because there is no `try / catch`, the unhandled error terminates the entire Node.js server process.
- **Current Behavior:**  
  Sending `{ contact: "03001234567" }` to `PUT /api/settings/users/:id` crashes the server.
- **Expected Behavior:**  
  Partial updates merge with existing row values (`name = name !== undefined ? name : existing.name`, etc.). Unhandled errors are caught and return HTTP 500 without crashing the process.
- **Proposed Fix:**  
  1. Merge all fields with `existing.*`:
     ```ts
     const updatedName = name !== undefined ? name : existing.name;
     const updatedEmail = email !== undefined ? email : existing.email;
     const updatedContact = contact !== undefined ? contact : existing.contact;
     const updatedRole = role !== undefined ? role : existing.role;
     const updatedDept = department !== undefined ? department : existing.department;
     const updatedPerms = permissions !== undefined ? permissions : (typeof existing.permissions === 'string' ? JSON.parse(existing.permissions || '{}') : existing.permissions);
     ```
  2. Wrap database calls in `try / catch` returning HTTP 500 if an unexpected error occurs.
- **Regression Test Required:**  
  Send a partial update containing only `contact`, assert HTTP 200, verify server remains running, and confirm `name`, `email`, and `role` are preserved.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P0-03] Payroll Adjustments Target Month Omission & Retroactive Misattribution (DEFECT-01)
- **Severity:** 🔴 **P0 — CRITICAL**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `calculatePayrollForMonth(month)` queries `created_at LIKE '${month}%'`. Retrospective adjustments created in month $N$ for month $N-1$ have `created_at` matching month $N$, so they are excluded from month $N-1$ and erroneously paid in month $N$.
- **Current Behavior:**  
  Adjustments created after month-end silently vanish from the target month and credit the following month.
- **Expected Behavior:**  
  Adjustments query by `payroll_id` (e.g. `pay_${emp.id}_${month}`) or matching target month so retrospective additions are correctly attributed.
- **Proposed Fix:**  
  In `calculatePayrollForMonth` line ~902:
  ```ts
  const payrollId = `pay_${emp.id}_${month}`;
  const adjustments = queryAll(db,
    'SELECT * FROM payroll_adjustments WHERE employee_id = ? AND (payroll_id = ? OR payroll_id LIKE ?)',
    [emp.id, payrollId, `%_${month}`]
  );
  ```
  Ensure `POST /api/payroll/adjustments` always sets `payroll_id = 'pay_' || employee_id || '_' || month`.
- **Regression Test Required:**  
  Add adjustment for July on August 31; calculate July payroll; verify `total_bonuses` includes the adjustment.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P1-01] Overnight Shift Duration Arithmetic Inversion Floored to 0.0 Hours (DEFECT-02)
- **Severity:** 🔴 **P1 — HIGH**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 10) / 10)` lacks 24-hour rollover math. Graveyard shifts (20:00 to 04:00) produce -960 minutes, floored to `0.0`.
- **Current Behavior:**  
  Employees working overnight shifts receive 0.0 logged work hours.
- **Expected Behavior:**  
  Overnight shifts account for midnight rollover: if difference < 0, add $24 \times 60$ minutes. Check-in 20:00 to Check-out 04:00 must calculate 8.0 hours worked.
- **Proposed Fix:**  
  Implement standardized helper `calculateHoursDifference(inTime: string, outTime: string): number`:
  ```ts
  let diff = (outH * 60 + outM) - (inH * 60 + inM);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 10) / 10;
  ```
  Apply across line 316 (biometric punch), line 1022 (single override), and line 1095 (bulk override).
- **Regression Test Required:**  
  Submit attendance override with 20:00:00 check-in and 04:00:00 check-out; verify `hours_worked == 8.0`.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P1-02] Unauthenticated Public Access to Confidential Payroll Metrics (DEFECT-03)
- **Severity:** 🔴 **P1 — HIGH**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  Route `/api/dashboard/metrics` omits `authMiddleware` and `requirePermission`.
- **Current Behavior:**  
  Unauthenticated network callers can pull headcount, daily accruals, and monthly baseline liabilities.
- **Expected Behavior:**  
  Unauthenticated requests receive HTTP 401. Only authorized users with `dashboard.view` permission receive metrics.
- **Proposed Fix:**  
  Update route declaration:
  ```ts
  app.get('/api/dashboard/metrics', authMiddleware, requirePermission('dashboard', 'view'), (req: Request, res: Response) => { ... });
  ```
- **Regression Test Required:**  
  Playwright `e2e/api_and_security.spec.js` asserting HTTP 401 without auth, HTTP 200 with Bearer token.
- **Potential Side Effects:** Frontend `<DashboardView />` must ensure token is attached (already handled via `authFetch`).
- **Dependencies:** None.

---

### [P1-03] Resigned/Inactive Employees Excluded from Payroll Despite Worked Days (DEFECT-ADV-05)
- **Severity:** 🔴 **P1 — HIGH**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `calculatePayrollForMonth(month)` queries `SELECT * FROM employees WHERE status = 'active'`. If an employee was active and worked shifts during the month but was changed to `'inactive'` before month-end calculation, they are dropped from payroll.
- **Current Behavior:**  
  Deactivated staff earn PKR 0 and have no payslip generated.
- **Expected Behavior:**  
  The payroll engine includes any employee who was either active during the period OR has recorded attendance/adjustments in that month.
- **Proposed Fix:**  
  In `calculatePayrollForMonth`:
  ```ts
  const employees = queryAll(db, `
    SELECT DISTINCT e.* FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.date LIKE ?
    WHERE e.status = 'active' OR a.id IS NOT NULL
  `, [`${month}%`]);
  ```
- **Regression Test Required:**  
  Create employee, log attendance for August, set status to `inactive`, calculate August payroll; verify employee record is generated with earned pay.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P1-04] Missing Time Format Validation in `attendanceOverrideSchema` (DEFECT-ADV-03)
- **Severity:** 🔴 **P1 — HIGH**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/src/validation.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/validation.ts)
- **Root Cause:**  
  `check_in_time` and `check_out_time` are typed as `z.string().optional().nullable()` without format regex. Malformed times like `"invalid"` evaluate to `NaN` and store `null` in SQLite.
- **Current Behavior:**  
  Invalid time strings pass validation and corrupt `hours_worked` to `null`.
- **Expected Behavior:**  
  Inputs must match HH:MM or HH:MM:SS format or be rejected with HTTP 400.
- **Proposed Fix:**  
  In `attendanceOverrideSchema`:
  ```ts
  check_in_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Invalid time format (HH:MM or HH:MM:SS)').optional().nullable(),
  check_out_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Invalid time format (HH:MM or HH:MM:SS)').optional().nullable(),
  ```
- **Regression Test Required:**  
  Post override with `check_in_time: 'invalid'`; assert HTTP 400 validation error.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P2-01] Flawed User Self-Deletion Check Permitting Admin Lockout (DEFECT-04)
- **Severity:** 🟡 **P2 — MEDIUM**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  Line 1649 compares `targetUser?.name === user.email`. Name never equals email, so check never triggers.
- **Current Behavior:**  
  Super admin can delete their own account.
- **Expected Behavior:**  
  Admins cannot delete their own account (HTTP 400).
- **Proposed Fix:**  
  Compare user IDs and emails:
  ```ts
  if (req.params.id === user.userId || targetUser?.email === user.email) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  ```
- **Regression Test Required:**  
  Attempt `DELETE /api/settings/users/usr_1` as `usr_1`; assert HTTP 400.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P2-02] Working on Scheduled Off-Days Uncredited for Daily Wage Earners (DEFECT-05)
- **Severity:** 🟡 **P2 — MEDIUM**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `if (empOffDates.has(dateStr)) { daysOff++; continue; }` bypasses attendance records on off-days.
- **Current Behavior:**  
  Daily wage staff earn PKR 0 for working Sundays or off-days.
- **Expected Behavior:**  
  If an employee has an active attendance record (`present` or `hours_worked > 0`) on an off-day, `daysPresent` increments so daily wage workers are paid.
- **Proposed Fix:**  
  Check attendance record before skipping:
  ```ts
  const att = attRecords.find(a => a.date === dateStr);
  const workedOnOffDay = att && (att.status === 'present' || att.status === 'half_day' || (att.hours_worked && att.hours_worked > 0));
  if (empOffDates.has(dateStr)) {
    daysOff++;
    if (!workedOnOffDay) continue;
  }
  ```
- **Regression Test Required:**  
  Daily wage earner with Sunday off works Sunday; verify gross earnings includes Sunday wage.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P2-03] Future Month Payroll Calculation Awards 100% Full Salary (DEFECT-06)
- **Severity:** 🟡 **P2 — MEDIUM**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  For future months, `daysToConsider = 0` implies `daysAbsent = 0`, resulting in `base_salary - 0 = base_salary`.
- **Current Behavior:**  
  Full unearned salary computed for future months.
- **Expected Behavior:**  
  For future periods (`daysToConsider === 0`), gross earnings and net payout evaluate to 0.
- **Proposed Fix:**  
  In `calculatePayrollForMonth`:
  ```ts
  if (daysToConsider === 0) {
    grossEarnings = 0;
    netPayout = 0;
  }
  ```
- **Regression Test Required:**  
  Calculate payroll for `2099-01`; verify `net_payout === 0`.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P2-04] Biometric ADMS Push Double-Punch Without Debounce (DEFECT-07)
- **Severity:** 🟡 **P2 — MEDIUM**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `processBiometricPunch` treats any subsequent punch as check-out without checking elapsed minutes.
- **Current Behavior:**  
  Double-punching within seconds marks employee as checked out with 0 hours.
- **Expected Behavior:**  
  Punches occurring within 5 minutes of check-in are debounced and ignored.
- **Proposed Fix:**  
  Calculate difference between `existingAtt.check_in_time` and `punchTime`. If elapsed time < 5 minutes, log warning and ignore.
- **Regression Test Required:**  
  Punch at 09:00:00 and 09:00:10; verify check_out is not set and check_in is preserved.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P2-05] Stored Cross-Site Scripting (XSS) in Print Templates (DEFECT-08)
- **Severity:** 🟡 **P2 — MEDIUM**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/src/utils/printUtils.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/utils/printUtils.ts)
  - [`mohsin-&-co-payroll-&-attendance/src/components/ReportsView.tsx`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/ReportsView.tsx)
  - [`mohsin-&-co-payroll-&-attendance/src/components/PayrollView.tsx`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/PayrollView.tsx)
- **Root Cause:**  
  Unescaped string interpolation into raw HTML strings written to `document.write`.
- **Current Behavior:**  
  `<img src=x onerror=alert(1)>` in names or descriptions executes JavaScript.
- **Expected Behavior:**  
  HTML entities (`<`, `>`, `&`, `"`, `'`) are sanitized before template insertion.
- **Proposed Fix:**  
  Implement `escapeHtml(str: string): string` utility and wrap all dynamic interpolations.
- **Regression Test Required:**  
  Format print document with XSS payload; verify characters are escaped.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P2-06] `half_day` Attendance Status Counted as 100% Full Day (DEFECT-09)
- **Severity:** 🟡 **P2 — MEDIUM**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `if (att.status === 'present' || att.status === 'half_day') daysPresent++;`.
- **Current Behavior:**  
  Daily wage staff receive 100% daily rate for half a day.
- **Expected Behavior:**  
  Daily wage staff receive 50% rate (0.5 day) for a half-day shift. Monthly staff deduct 0.5 per-day rate.
- **Proposed Fix:**  
  Track `halfDays`:
  ```ts
  if (att.status === 'present') {
    daysPresent++;
  } else if (att.status === 'half_day') {
    halfDays++;
  }
  // Daily wage calculation:
  grossEarnings = (baseRate * daysPresent) + (baseRate * 0.5 * halfDays);
  ```
- **Regression Test Required:**  
  Employee with 1 half day earns `0.5 * dailyRate`.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

### [P2-07] Safe HTTP `GET /api/payroll/records` Mutates Database (DEFECT-ADV-04)
- **Severity:** 🟡 **P2 — MEDIUM**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts)
- **Root Cause:**  
  `GET /api/payroll/records` invokes `calculatePayrollForMonth(month)` when draft records exist, executing synchronous `fs.writeFileSync`.
- **Current Behavior:**  
  Read requests trigger disk writes and mutate database state.
- **Expected Behavior:**  
  `GET /api/payroll/records` is a pure, idempotent read. Automatic recalculation is only triggered if 0 records exist for an active month.
- **Proposed Fix:**  
  Remove the `else if (records.every((r: any) => r.status === 'draft')) calculatePayrollForMonth(month);` mutation block from the GET handler. Recomputations must be requested via `POST /api/payroll/calculate`.
- **Regression Test Required:**  
  `GET /api/payroll/records` executes without modifying record generated timestamps or forcing writes.
- **Potential Side Effects:** Frontend refresh must call `calculate` when intentional recalculation is desired (which the UI already does).
- **Dependencies:** None.

---

### [P3-01] Cascading Unawaited Async Handlers Race Condition (DEFECT-10)
- **Severity:** 🟢 **P3 — LOW**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/src/App.tsx`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/App.tsx)
- **Root Cause:**  
  `handleAddAdjustment` does not await `handleCalculatePayroll`, which does not await `loadData()`. Background requests race with newly calculated records in state.
- **Current Behavior:**  
  Concurrent unawaited fetch calls can overwrite fresh payroll records with stale cached data from disk.
- **Expected Behavior:**  
  Asynchronous operations are sequenced cleanly with `await` so calculated payroll state reflects the latest applied adjustments.
- **Proposed Fix:**  
  Chain and `await` the promises in `handleAddAdjustment` and `handleCalculatePayroll`.
- **Regression Test Required:**  
  Verify sequential execution of adjustment creation and payroll refresh without stale state reversion.
- **Potential Side Effects:** Minimal; UI awaits calculation response before rendering completes.
- **Dependencies:** None.

---

### [P3-02] Hardcoded Plaintext Production Credentials in Login UI (DEFECT-11)
- **Severity:** 🟢 **P3 — LOW**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/src/components/LoginPage.tsx`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/LoginPage.tsx)
  - [`e2e/auth_and_navigation.spec.js`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/e2e/auth_and_navigation.spec.js)
  - [`e2e/core_workflows.spec.js`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/e2e/core_workflows.spec.js)
- **Root Cause:**  
  `LoginPage.tsx` initializes form state with `'admin@mohsinco.com'` and `'changeme123'` and renders credentials in plaintext in the footer.
- **Current Behavior:**  
  Any unauthenticated user visiting `/` sees administrative login credentials exposed on screen.
- **Expected Behavior:**  
  Inputs default to empty strings; default credentials banner is removed or restricted; E2E tests fill inputs programmatically.
- **Proposed Fix:**  
  Initialize `email` and `password` with empty strings (`''`) and remove the plaintext credentials banner. Update E2E test helpers to input credentials explicitly.
- **Regression Test Required:**  
  Playwright test `TC-AUTH-01` updated to confirm login inputs are initially empty and credentials notice is not rendered.
- **Potential Side Effects:** E2E test flows that clicked submit without typing credentials must now ensure credentials are typed.
- **Dependencies:** E2E test helpers.

---

### [P3-03] Dark-to-Light Flash of Unstyled Content (FOUC) (DEFECT-12)
- **Severity:** 🟢 **P3 — LOW**
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/index.html`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/index.html)
- **Root Cause:**  
  `index.html` defines the initial body background as `bg-[#0b0f19]` (dark), while React application root mounts with `bg-[#f0f2f5]` (light).
- **Current Behavior:**  
  Browser renders dark background, followed by an immediate transition to light gray, creating visual FOUC.
- **Expected Behavior:**  
  Body background matches application container background (`bg-[#f0f2f5]`), providing a seamless initial render.
- **Proposed Fix:**  
  Update `index.html` body class to use `bg-[#f0f2f5] text-gray-900`.
- **Regression Test Required:**  
  Playwright test `TC-AUTH-04` verifying body class contains `bg-[#f0f2f5]`.
- **Potential Side Effects:** None.
- **Dependencies:** None.

---

## Verification & Execution Order

We will execute the fixes in strict order:
1. **Phase 1 (P0 Fixes):** P0-01 (`dotenv`), P0-02 (User partial update crash), P0-03 (Adjustments month attribution).
2. **Phase 2 (P1 Fixes):** P1-01 (Overnight shift math), P1-02 (Metrics endpoint auth), P1-03 (Inactive employee payroll), P1-04 (Time regex validation).
3. **Phase 3 (P2 Fixes):** P2-01 (Self-deletion check), P2-02 (Off-day work wage), P2-03 (Future month payout), P2-04 (Biometric double-punch debounce), P2-05 (XSS escaping), P2-06 (Half-day proration), P2-07 (Pure GET payroll records).
4. **Phase 4 (P3 Fixes):** P3-01 (Async race condition), P3-02 (Login credentials), P3-03 (FOUC).
5. **Phase 5 (Full Quality Gate):** Typecheck, build, unit tests, integration tests, Playwright E2E suites.
