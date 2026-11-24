# P2_FIX_PLAN.md — Master Codex Phase 3: P2 Remediation Plan

**Specification:** Master Codex Software QA Remediation Pass — Phase 3: P2 Remediation  
**Operating Principle:** Strict P2 scope only. Fix one defect at a time. Every fix backed by pre-fix regression test failure, minimal safe implementation, adversarial validation, and full quality gate execution. No P0/P1/P3 or speculative modifications.

---

## 1. Prioritization & Ordering

P2 findings are ordered according to the Codex criteria (1. Data Correctness, 2. Security Hardening, 3. Important Workflow Reliability, 4. API/Backend Correctness):

| Sequence | Finding ID | Defect Key | Category | Title | Affected Files |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | **P2-01** | `DEFECT-09` | Data Correctness (Payroll) | `half_day` Attendance Status Counted as 100% Full Day in Daily Wage Payroll | `mohsin-&-co-payroll-&-attendance/server.ts` |
| **2** | **P2-02** | `DEFECT-05` | Data Correctness (Payroll) | Working on Scheduled Off-Days Uncredited for Daily Wage Earners | `mohsin-&-co-payroll-&-attendance/server.ts` |
| **3** | **P2-03** | `DEFECT-06` | Data Correctness (Payroll) | Future Month Payroll Calculation Awards 100% Full Salary for 0 Days Worked | `mohsin-&-co-payroll-&-attendance/server.ts` |
| **4** | **P2-04** | `DEFECT-04` | Security Hardening (RBAC) | Flawed Self-Deletion Check (`targetUser.name === user.email`) Permitting Admin Self-Lockout | `mohsin-&-co-payroll-&-attendance/server.ts` |
| **5** | **P2-05** | `DEFECT-08` | Security Hardening (XSS) | Stored Cross-Site Scripting (XSS) in Printable Ledger & Reports Templates | `mohsin-&-co-payroll-&-attendance/src/utils/printUtils.ts`, `ReportsView.tsx`, `PayrollView.tsx` |
| **6** | **P2-06** | `DEFECT-07` | Workflow Reliability (ADMS) | Biometric ADMS Push Double-Punch Without Debounce Collapsing to 0.0 Hours | `mohsin-&-co-payroll-&-attendance/server.ts` |
| **7** | **P2-07** | `DEFECT-ADV-04` | API/Backend Correctness | Safe HTTP `GET /api/payroll/records` Mutating Database & Triggering Sync Writes | `mohsin-&-co-payroll-&-attendance/server.ts` |

---

## 2. Detailed P2 Defect Specifications

### [P2-01] DEFECT-09: `half_day` Attendance Status Counted as 100% Full Day in Daily Wage Payroll
- **ID:** `P2-01`
- **Title:** `half_day` Attendance Status Counted as 100% Full Day in Daily Wage Payroll
- **Severity:** 🟡 **MEDIUM (Wage Calculation Defect)**
- **Affected Feature:** Payroll Calculation Engine (`calculatePayrollForMonth` and `/api/payroll/range`)
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L895-945`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L895-L945)
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L1300-1340`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1300-L1340)
- **Root Cause:**  
  `if (att.status === 'present' || att.status === 'half_day') daysPresent++;`.  
  Daily wage gross earnings are calculated as `baseRate * daysPresent`. If a worker with daily rate PKR 2,000 has 1 `half_day` shift and 0 other shifts, `daysPresent` is incremented to 1, and the worker is paid PKR 2,000 (100%) instead of PKR 1,000 (50%).
- **Reproduction:**  
  Log 1 `half_day` attendance record for a daily wage earner (daily rate PKR 2,000). Calculate payroll; `gross_earnings` evaluates to 2000 instead of 1000.
- **Expected Behavior:**  
  A `half_day` shift counts as 0.5 effective days for daily wage earners (`baseRate * 0.5`).
- **Proposed Fix:**  
  Track `halfDays` separately in `calculatePayrollForMonth` and `/api/payroll/range`:
  ```ts
  if (att.status === 'present') {
    daysPresent++;
  } else if (att.status === 'half_day') {
    halfDays++;
  }
  // For daily wage:
  grossEarnings = (baseRate * daysPresent) + (baseRate * 0.5 * halfDays);
  ```
- **Regression Test:**  
  Create daily wage employee with rate PKR 2,000, mark 1 `half_day`, verify `gross_earnings === 1000`.
- **Possible Side Effects:** None; monthly staff continue to receive contractual base salary with appropriate per-day deductions for absent days.

---

### [P2-02] DEFECT-05: Working on Scheduled Off-Days Uncredited for Daily Wage Earners
- **ID:** `P2-02`
- **Title:** Working on Scheduled Off-Days Uncredited for Daily Wage Earners
- **Severity:** 🟡 **MEDIUM (Wage Withholding Defect)**
- **Affected Feature:** Payroll Calculation Engine
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L880-890`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L880-L890)
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L1295-1310`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1295-L1310)
- **Root Cause:**  
  ```ts
  if (empOffDates.has(dateStr)) {
    daysOff++;
    continue; // Immediately jumps to next day without checking attendance!
  }
  ```
  If a daily wage worker comes in on their scheduled off-day (e.g. Sunday overtime/emergency shift) and logs a `present` attendance record, the loop executes `continue`. `daysPresent` does not increment, and the worker is paid PKR 0 for that shift.
- **Reproduction:**  
  Mark Sunday as an employee off-date in `custom_off_dates`. Add a `present` attendance override on that Sunday. Calculate payroll; the Sunday shift is ignored and unpaid.
- **Expected Behavior:**  
  If an employee has recorded attendance (`present`, `late`, `half_day`, or `hours_worked > 0`) on a scheduled off-day, that shift is credited to their worked days and paid out.
- **Proposed Fix:**  
  Inspect the attendance record for that date before skipping:
  ```ts
  const att = attRecords.find(a => a.date === dateStr);
  const workedOnOffDay = att && (att.status === 'present' || att.status === 'late' || att.status === 'half_day' || (att.hours_worked && att.hours_worked > 0));
  if (empOffDates.has(dateStr)) {
    daysOff++;
    if (!workedOnOffDay) continue;
  }
  ```
- **Regression Test:**  
  Daily wage worker works on Sunday off-date; assert `days_present` increments and gross earnings includes that day's pay.
- **Possible Side Effects:** None; workers who do not work on their off-day continue to be recorded as `daysOff` and skipped.

---

### [P2-03] DEFECT-06: Future Month Payroll Calculation Awards 100% Full Salary for 0 Days Worked
- **ID:** `P2-03`
- **Title:** Future Month Payroll Calculation Awards 100% Full Salary for 0 Days Worked
- **Severity:** 🟡 **MEDIUM (Financial Calculation Defect)**
- **Affected Feature:** Payroll Calculation Engine
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L865-875, L935-950`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L865-L875)
- **Root Cause:**  
  For future months, `daysToConsider = 0`. The absence count is calculated as `totalWorkingDays - daysPresent - daysOff - daysLeave`. When `daysToConsider === 0`, `totalWorkingDays` is 0, so `daysAbsent = 0`. Net payout for monthly staff is computed as `base_salary - (perDayRate * 0) = base_salary`. As a result, employees are credited with 100% full salary for unworked future calendar periods.
- **Reproduction:**  
  Call `POST /api/payroll/calculate` with `month: '2099-01'`. The returned record shows `net_payout = base_salary` despite 0 days worked.
- **Expected Behavior:**  
  When payroll is calculated for a future month where 0 days have elapsed (`daysToConsider === 0`), `gross_earnings` and `net_payout` must evaluate to 0 (unless explicit adjustments/advances are registered).
- **Proposed Fix:**  
  In `calculatePayrollForMonth`:
  ```ts
  if (daysToConsider === 0) {
    grossEarnings = 0;
    netPayout = Math.max(0, totalBonuses - totalFines - advanceDeductions);
  }
  ```
- **Regression Test:**  
  Calculate payroll for `2099-01`; assert `net_payout === 0` and `gross_earnings === 0`.
- **Possible Side Effects:** None; historical and current months have `daysToConsider > 0` and calculate standard accruals.

---

### [P2-04] DEFECT-04: Flawed Self-Deletion Check Permitting Admin Self-Lockout
- **ID:** `P2-04`
- **Title:** Flawed Self-Deletion Check (`targetUser.name === user.email`) Permitting Admin Self-Lockout
- **Severity:** 🟡 **MEDIUM (Broken Access Control / CWE-284)**
- **Affected Feature:** User Management API (`DELETE /api/settings/users/:id`)
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L1682-1695`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1682-L1695)
- **Root Cause:**  
  ```ts
  if (targetUser?.name === user.email) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  ```
  `targetUser.name` contains the user's display name (e.g. `"Super Administrator"`), whereas `user.email` contains the JWT caller's email (e.g. `"admin@mohsinco.com"`). They never match, allowing super administrators to delete their own user record and lock themselves out.
- **Reproduction:**  
  Send `DELETE /api/settings/users/usr_1` while authenticated as `usr_1` (`admin@mohsinco.com`). The server accepts the request with HTTP 200 instead of returning HTTP 400.
- **Expected Behavior:**  
  The server compares both `id` and `email` against the authenticated session (`user.userId` and `user.email`). If either matches, return HTTP 400 Bad Request (`"Cannot delete your own account"`).
- **Proposed Fix:**  
  ```ts
  if (id === user.userId || targetUser?.email === user.email) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  ```
- **Regression Test:**  
  Authenticate as `usr_1`, send `DELETE /api/settings/users/usr_1`, assert HTTP 400 with error `'Cannot delete your own account'`.
- **Possible Side Effects:** None; admins can still delete other user accounts.

---

### [P2-05] DEFECT-08: Stored Cross-Site Scripting (XSS) in Printable Ledger & Reports Templates
- **ID:** `P2-05`
- **Title:** Stored Cross-Site Scripting (XSS) in Printable Ledger & Reports Templates
- **Severity:** 🟡 **MEDIUM (Stored XSS / CWE-79)**
- **Affected Feature:** Report Printing & Payslip Generation
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/src/utils/printUtils.ts`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/utils/printUtils.ts)
  - [`mohsin-&-co-payroll-&-attendance/src/components/ReportsView.tsx:L155-185`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/ReportsView.tsx#L155-L185)
  - [`mohsin-&-co-payroll-&-attendance/src/components/PayrollView.tsx:L170-195`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/PayrollView.tsx#L170-L195)
- **Root Cause:**  
  Dynamic employee data (`employee_name`, `department`, `designation`, `description`) is concatenated directly into HTML strings passed to `printWin.document.write(...)` without HTML escaping.
- **Reproduction:**  
  Create an employee named `<img src=x onerror=alert(1)>`. Generate printable payslip or report; the script payload executes in the print window context.
- **Expected Behavior:**  
  All dynamic text interpolated into raw printable HTML strings must be entity-encoded (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`).
- **Proposed Fix:**  
  Provide a standardized `escapeHtml(unsafe: string | null | undefined): string` helper in `src/utils/printUtils.ts` and apply it to all dynamic fields before inserting into document templates.
- **Regression Test:**  
  Format print template with employee name containing `<script>` and `<img>` tags; verify output HTML contains escaped `&lt;script&gt;` and `&lt;img src=x onerror=alert(1)&gt;`.
- **Possible Side Effects:** None; legitimate names with characters like `&` or quotes render cleanly.

---

### [P2-06] DEFECT-07: Biometric ADMS Push Double-Punch Without Debounce Collapsing to 0.0 Hours
- **ID:** `P2-06`
- **Title:** Biometric ADMS Push Double-Punch Without Debounce Collapsing to 0.0 Hours
- **Severity:** 🟡 **MEDIUM (Hardware Ingestion Logic Defect)**
- **Affected Feature:** Biometric Device ADMS Endpoint (`/iclock/cdata`)
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L310-335`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L310-L335)
- **Root Cause:**  
  When an employee punches their finger twice on the terminal (e.g. 5 seconds apart), the first punch creates the check-in record. The second punch is unconditionally treated as a check-out, immediately overwriting `check_out_time` and logging `0.0 hours worked`.
- **Reproduction:**  
  Push two biometric punches for an employee on the same date with timestamps `09:00:00` and `09:00:15`. The employee is marked as checked out with 0 hours worked.
- **Expected Behavior:**  
  Punches occurring within 5 minutes of the initial check-in are debounced and ignored as duplicate accidental scans.
- **Proposed Fix:**  
  In `processBiometricPunch`:
  ```ts
  if (existingAtt) {
    const checkInTime = existingAtt.check_in_time || '09:00:00';
    const [cInH, cInM] = checkInTime.split(':').map(Number);
    const elapsedMinutes = (punchHour * 60 + punchMin) - (cInH * 60 + cInM);
    // Ignore double-punches within 5 minutes of check-in
    if (elapsedMinutes >= 0 && elapsedMinutes < 5) {
      console.warn(`[ADMS] Debounced duplicate punch for employee ${emp.id} within ${elapsedMinutes} mins of check-in`);
      return;
    }
    // Proceed with normal check-out calculation
  }
  ```
- **Regression Test:**  
  Push punch at 09:00:00 and immediate duplicate at 09:00:30; verify `check_out_time` remains null and attendance is not closed out with 0 hours.
- **Possible Side Effects:** None; legitimate check-outs occurring at the end of the shift (> 5 minutes later) process normally.

---

### [P2-07] DEFECT-ADV-04: Safe HTTP `GET /api/payroll/records` Mutating Database & Triggering Sync Writes
- **ID:** `P2-07`
- **Title:** Safe HTTP `GET /api/payroll/records` Mutating Database & Triggering Sync Writes
- **Severity:** 🟡 **MEDIUM (HTTP Semantics & Performance Defect)**
- **Affected Feature:** Payroll Records API (`GET /api/payroll/records`)
- **Affected Files:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L1140-1165`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1140-L1165)
- **Root Cause:**  
  `GET /api/payroll/records` checks `if (records.length === 0 || records.every((r: any) => r.status === 'draft')) calculatePayrollForMonth(month);`.  
  Every safe HTTP `GET` request for records executes a full recalculation loop, overwriting the database table and executing synchronous `fs.writeFileSync`.
- **Reproduction:**  
  Send `GET /api/payroll/records?month=2026-08`. Observe that the endpoint executes SQLite writes and updates `generated_at` timestamps on a read request.
- **Expected Behavior:**  
  `GET /api/payroll/records` is an idempotent, pure read operation that queries the database without writing to disk. Explicit calculations are triggered only via `POST /api/payroll/calculate`.
- **Proposed Fix:**  
  In `app.get('/api/payroll/records', ...)`:
  Remove the automatic recalculation block. Simply query existing records for the month (`SELECT * FROM payroll_records WHERE period_month = ?`). If no records exist, return an empty array `[]` (the UI already provides a dedicated "Calculate Payroll" action).
- **Regression Test:**  
  Call `GET /api/payroll/records?month=2026-08`; verify database state is unmodified and no write operation occurs.
- **Possible Side Effects:** None; frontend components already call `handleCalculatePayroll` via `POST /api/payroll/calculate` when recalculation is needed.

---

## 3. Step-by-Step Remediation Sequence

We will remediate strictly one P2 defect at a time:
1. **P2-01 (DEFECT-09)**: `half_day` wage calculation (test failure → fix in `server.ts` → verify).
2. **P2-02 (DEFECT-05)**: Worked scheduled off-days pay credit (test failure → fix in `server.ts` → verify).
3. **P2-03 (DEFECT-06)**: Future month 0-day salary flooring (test failure → fix in `server.ts` → verify).
4. **P2-04 (DEFECT-04)**: Self-deletion check hardening (test failure → fix in `server.ts` → verify).
5. **P2-05 (DEFECT-08)**: Stored XSS entity escaping in print utilities (test failure → implement `escapeHtml` & apply → verify).
6. **P2-06 (DEFECT-07)**: Biometric ADMS punch debounce (test failure → fix in `server.ts` → verify).
7. **P2-07 (DEFECT-ADV-04)**: Idempotent `GET /api/payroll/records` without side-effects (test failure → remove mutation in `server.ts` → verify).
8. **Full Regression & Quality Gate**:
   - Run typecheck (`tsc --noEmit`), build (`node build.js`), unit tests, integration tests, adversarial suites, and Playwright tests.
   - Update `qa/findings/VERIFIED.md`, `qa/findings/FIXED.md`, and produce `qa/reports/P2_FIX_REPORT.md`.
