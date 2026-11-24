# P1_FIX_PLAN.md — Master Codex Phase 2: P1 Remediation Plan

**Specification:** Master Codex Software QA Remediation Pass — Phase 2: P1 Remediation  
**Operating Principle:** Strict P1 scope only. Fix one defect at a time. Every fix backed by pre-fix regression failure, minimal safe implementation, adversarial bypass testing, and full quality gate execution.

---

## 1. Prioritization & Ordering

P1 findings are ordered according to the Codex criteria (1. Security/Data Integrity, 2. Authentication/Authorization, 3. Business-Critical Workflows, 4. API/Database Correctness):

| Sequence | Finding ID | Defect Key | Category | Title | Affected Files |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | **P1-01** | `DEFECT-03` / `DEFECT-ADV-08` | Security / Auth | Unauthenticated Public Access to Confidential Financial Metrics | `mohsin-&-co-payroll-&-attendance/server.ts` |
| **2** | **P1-02** | `DEFECT-ADV-03` | Data Integrity / Validation | Missing Time Format Validation in `attendanceOverrideSchema` | `mohsin-&-co-payroll-&-attendance/src/validation.ts` |
| **3** | **P1-03** | `DEFECT-02` / `DEFECT-ADV-07` | Business Logic / Math | Overnight Shift Duration Arithmetic Inversion Floored to 0.0 Hours | `mohsin-&-co-payroll-&-attendance/server.ts` |
| **4** | **P1-04** | `DEFECT-ADV-05` | Business Logic / Payroll | Resigned/Inactive Employees Excluded from Payroll Despite Worked Shifts | `mohsin-&-co-payroll-&-attendance/server.ts` |

---

## 2. Detailed P1 Defect Specifications

### [P1-01] DEFECT-03 / DEFECT-ADV-08: Unauthenticated Public Access to Confidential Financial Metrics
- **ID:** `P1-01`
- **Title:** Unauthenticated Public Access to Confidential Financial Metrics (`/api/dashboard/metrics`)
- **Severity:** 🔴 **HIGH (Information Disclosure / CWE-306)**
- **Affected Feature:** Dashboard & Executive Metrics Reporting
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L1452`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1452)
- **Root Cause:**  
  Endpoint `app.get('/api/dashboard/metrics', (req: Request, res: Response) => { ... })` is mounted without `authMiddleware`. Any unauthenticated network client or automated scraper can query current headcount, present count, today's payroll accrual, and monthly baseline liabilities in plaintext JSON without providing credentials.
- **Existing Evidence:**  
  Playwright `e2e/api_and_security.spec.js` (Test `TC-SEC-01`) confirmed that issuing an unauthenticated GET request returned HTTP 200 and live payload `{ total_employees: 2, today_payroll_accrual: 1923, ... }`.
- **Existing Reproduction:**  
  `curl -i http://localhost:3000/api/dashboard/metrics` returns HTTP 200 OK without headers.
- **Required Regression Test:**  
  - Unauthenticated `GET /api/dashboard/metrics` must return **HTTP 401 Unauthorized** (`{"error": "Authentication token required"}`).
  - Authenticated request with valid Bearer token must return **HTTP 200 OK** and valid metrics object.
- **Proposed Minimal Fix:**  
  Add `authMiddleware` to the endpoint:
  ```ts
  app.get('/api/dashboard/metrics', authMiddleware, (req: Request, res: Response) => {
  ```
- **Potential Side Effects:**  
  Frontend client `<DashboardView />` must supply the authentication token. In `App.tsx` and `DashboardView.tsx`, the request already uses `authFetch('/api/dashboard/metrics')` which automatically attaches the `Authorization: Bearer <token>` header from `localStorage`.

---

### [P1-02] DEFECT-ADV-03: Missing Time Format Validation in `attendanceOverrideSchema`
- **ID:** `P1-02`
- **Title:** Missing Time Format Validation in `attendanceOverrideSchema` Allowing `NaN` / `null` Hours Worked
- **Severity:** 🔴 **HIGH (Data Integrity & Validation / CWE-20)**
- **Affected Feature:** Attendance & Shift Overrides API
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/src/validation.ts:L68-69`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/validation.ts#L68-L69)
- **Root Cause:**  
  In `attendanceOverrideSchema`, `check_in_time` and `check_out_time` are typed as `z.string().optional().nullable()` without format validation regex. Unlike `createShiftSchema` which enforces `^\d{2}:\d{2}$`, `attendanceOverrideSchema` accepts arbitrary non-time strings (e.g. `"not-a-time"`). In `server.ts:1020-1025`, `finalInTime.split(':').map(Number)` converts `"not-a-time"` to `[NaN]`. Arithmetic produces `NaN`, which SQLite stores as `null`. The attendance ledger is corrupted with `hours_worked = null`.
- **Existing Evidence:**  
  Test in `tests/new_adversarial_defects.mjs` (Test 2) confirmed that sending `{ check_in_time: "not-a-time", check_out_time: "invalid" }` returned HTTP 200 and resulted in `hours_worked: null` in SQLite.
- **Existing Reproduction:**  
  `POST /api/attendance/override` with `{ check_in_time: "abc" }` succeeds with HTTP 200 and corrupts the record.
- **Required Regression Test:**  
  - `POST /api/attendance/override` with malformed time string (e.g. `"not-a-time"`, `"99:99"`, `"25:00"`) must be rejected with **HTTP 400 Bad Request**.
  - `POST /api/attendance/override` with valid `HH:MM` or `HH:MM:SS` format (e.g. `"09:00"`, `"09:00:00"`) must be accepted with **HTTP 200 OK**.
- **Proposed Minimal Fix:**  
  Add regex validation to `attendanceOverrideSchema` in `src/validation.ts`:
  ```ts
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  // in attendanceOverrideSchema:
  check_in_time: z.string().regex(timeRegex, 'Invalid time format (HH:MM or HH:MM:SS)').optional().nullable(),
  check_out_time: z.string().regex(timeRegex, 'Invalid time format (HH:MM or HH:MM:SS)').optional().nullable(),
  ```
- **Potential Side Effects:**  
  Any client sending malformed time will receive a descriptive 400 validation error rather than corrupting database ledger rows. Standard frontend time pickers provide `HH:MM` or `HH:MM:SS`.

---

### [P1-03] DEFECT-02 / DEFECT-ADV-07: Overnight Shift Duration Arithmetic Inversion Floored to 0.0 Hours
- **ID:** `P1-03`
- **Title:** Overnight Shift Duration Arithmetic Inversion Floored to 0.0 Hours
- **Severity:** 🔴 **HIGH (Compensation Data Loss & Wage Calculation Failure)**
- **Affected Feature:** Attendance Ingestion & Shift Duration Calculation
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L316`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L316)
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L1022`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1022)
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L1095`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1095)
- **Root Cause:**  
  Work hours calculation across biometric punch ingestion (`line 317`), single manual override (`line 1022`), and bulk override (`line 1095`) uses:
  ```ts
  hoursWorked = Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 10) / 10);
  ```
  When a shift spans midnight (e.g. night shift 20:00 to 04:00), `outH * 60 + outM = 240` and `inH * 60 + inM = 1200`. The difference is `-960` minutes. `Math.max(0, -16.0)` floors the value to `0.0`. Workers on overnight shifts receive 0 logged work hours and lose entire compensation.
- **Existing Evidence:**  
  `tests/qa_adversarial_deep_audit.mjs` (Test 2) and `tests/adversarial_live_audit.mjs` (Test 4) demonstrated that 20:00 to 04:00 yields `0.0 hours worked`.
- **Existing Reproduction:**  
  Calling `POST /api/attendance/override` with `check_in_time: "20:00:00"` and `check_out_time: "04:00:00"` records `hours_worked: 0`.
- **Required Regression Test:**  
  - A shift from 20:00:00 to 04:00:00 must calculate **8.0 hours worked**.
  - A shift from 22:00:00 to 06:30:00 must calculate **8.5 hours worked**.
  - Standard daytime shifts (e.g. 09:00 to 17:00) must continue calculating **8.0 hours worked**.
- **Proposed Minimal Fix:**  
  Create a shared duration calculator in `server.ts`:
  ```ts
  function calculateShiftHours(inTime: string, outTime: string): number {
    const [inH, inM] = inTime.split(':').map(Number);
    const [outH, outM] = outTime.split(':').map(Number);
    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return 0;
    let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60; // 24-hour midnight rollover
    }
    return Math.round((diffMinutes / 60) * 10) / 10;
  }
  ```
  Apply consistently at lines 317, 1022, and 1095 in `server.ts`.
- **Potential Side Effects:** None. Daytime shifts remain unchanged because `diffMinutes >= 0`. Only cross-midnight shifts receive the correct 24h rollover.

---

### [P1-04] DEFECT-ADV-05: Resigned/Inactive Employees Excluded from Payroll Despite Worked Shifts
- **ID:** `P1-04`
- **Title:** Resigned/Inactive Employees Excluded from Payroll Despite Worked Shifts
- **Severity:** 🔴 **HIGH (Financial Non-Compliance & Wage Theft)**
- **Affected Feature:** Payroll Calculation Engine
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L827`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L827)
- **Root Cause:**  
  `calculatePayrollForMonth(month)` queries employees with:
  ```ts
  const employees = queryAll(db, 'SELECT * FROM employees WHERE status = ?', ['active']);
  ```
  If an employee worked 15 days in August and resigned/was deactivated on August 20 (`status = 'inactive'`), running August payroll on August 31 completely omits them from the payroll run. No payslip is generated and net pay is PKR 0.
- **Existing Evidence:**  
  Documented in `qa/audits/INDEPENDENT_ADVERSARIAL_AUDIT.md` (DEFECT-ADV-05). Verified in SQLite state where inactive employees with valid attendance logs are dropped by `WHERE status = 'active'`.
- **Existing Reproduction:**  
  Create employee, add attendance records for May, update employee status to `'inactive'`, calculate May payroll. The employee is missing from payroll records.
- **Required Regression Test:**  
  - Create employee with salary PKR 60,000.
  - Record 10 present days for May 2026.
  - Set employee `status = 'inactive'`.
  - Calculate payroll for May 2026.
  - Verify employee IS included in payroll calculation and receives earned wages.
- **Proposed Minimal Fix:**  
  In `calculatePayrollForMonth(month)` line 827, select employees who are currently active OR who have recorded attendance or adjustments in the target month:
  ```ts
  const employees = queryAll(db, `
    SELECT DISTINCT e.* FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.date LIKE ?
    LEFT JOIN payroll_adjustments adj ON adj.employee_id = e.id AND (adj.payroll_id LIKE ? OR (adj.payroll_id IS NULL AND adj.created_at LIKE ?))
    WHERE e.status = 'active' OR a.id IS NOT NULL OR adj.id IS NOT NULL
  `, [`${month}%`, `%_${month}`, `${month}%`]);
  ```
- **Potential Side Effects:**  
  Inactive employees without any attendance or adjustments in that month remain properly excluded, preventing historical bloat. Only inactive employees with legitimate activity in the month receive payslips.

---

## 3. Step-by-Step Remediation Plan

We will remediate strictly one P1 defect at a time:
1. **P1-01 (`DEFECT-03` / `DEFECT-ADV-08`)**:
   - Write failing regression test in `tests/p1_regression.mjs`.
   - Apply fix to `server.ts:1452`.
   - Rebuild, restart daemon, verify test passes.
   - Attack fix with bypass tests.
2. **P1-02 (`DEFECT-ADV-03`)**:
   - Add failing test for malformed time validation in `tests/p1_regression.mjs`.
   - Apply regex fix to `src/validation.ts`.
   - Rebuild, verify test passes.
   - Attack fix with boundary values.
3. **P1-03 (`DEFECT-02` / `DEFECT-ADV-07`)**:
   - Add failing test for overnight shift calculation in `tests/p1_regression.mjs`.
   - Apply 24h rollover duration helper to `server.ts`.
   - Rebuild, restart daemon, verify test passes.
   - Attack fix with multi-day / edge durations.
4. **P1-04 (`DEFECT-ADV-05`)**:
   - Add failing test for deactivated employee payroll calculation in `tests/p1_regression.mjs`.
   - Update `calculatePayrollForMonth` query in `server.ts`.
   - Rebuild, restart daemon, verify test passes.
   - Attack fix with zero-activity inactive employees.
5. **Full Quality Gate Verification**:
   - Run typecheck, lint, unit tests, Playwright suites, and production build.
   - Document fixes in `qa/findings/FIXED.md`, update `qa/findings/VERIFIED.md`, create `qa/reports/P1_FIX_REPORT.md`.
   - Stop and report: `"P1 remediation complete. Awaiting independent verification."`
