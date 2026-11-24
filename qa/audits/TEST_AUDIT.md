# TEST_AUDIT.md — Existing Test Suite Evaluation & Coverage Gap Analysis

**Specification:** Master Codex Software QA Audit — Phase 3  
**Scope:** Review all existing test suites, evaluate assertion strength, identify false senses of security, and establish regression test requirements.

---

## 1. Existing Test Inventory & Evaluation

### 1.1 `tests/test_audit_suite.py` (Python `pytest`)
- **Execution Command:** `python -m pytest tests/test_audit_suite.py -v`
- **Result:** **14 PASSED** (0.07s)
- **Files Under Test:** Standalone Python classes (`ShiftRule`, `process_punch`, `calculate_hours_worked`) reimplementing TypeScript formulas.
- **Coverage Breakdown:**
  - `test_punch_on_time`: Asserts punch at 09:00 with check-in 09:00 produces `status == 'present'`, `late_mins == 0`.
  - `test_punch_within_grace_period`: Asserts punch at 09:20 produces `status == 'present'`, `late_mins == 20`.
  - `test_punch_exceeding_grace_period_marked_absent`: Asserts punch at 09:31 produces `status == 'absent'`, `late_mins == 31`.
  - `test_punch_exceeding_grace_period_marked_late_when_absent_flag_off`: Asserts `mark_absent_after_grace == 0` produces `status == 'late'`.
  - `test_hours_worked_calculation`: Asserts 09:00 to 17:00 yields `8.0` hours.
  - `test_monthly_payroll_full_attendance`: Asserts full calendar attendance produces 0 deductions.
  - `test_monthly_payroll_with_unexcused_absences`: Asserts formula `per_day_rate * days_absent`.
  - `test_monthly_payroll_with_approved_leave`: Asserts leave days are excused.
  - `test_monthly_payroll_mid_month_not_penalizing_future_days`: Asserts elapsed days bounding.
  - `test_monthly_payroll_with_adjustments`: Asserts addition of bonuses and deduction of fines.
  - `test_daily_wage_payroll`: Asserts `base_salary * days_present`.
  - `test_payroll_net_payout_floor`: Asserts `max(0, net)`.
  - `test_self_deletion_bug_demonstration`: Demonstrates that comparing name with email permits deletion.
  - `test_auto_code_generation_logic`: Tests parsing of `EMP-X` strings.
- **Audit Assessment & Critical Gaps:**
  - ⚠️ **100% Mocked:** This test suite tests Python approximations, NOT the actual Express application, NOT `server.ts`, and NOT the SQLite database.
  - ⚠️ **False Sense of Security:** It passes completely while catastrophic bugs exist in the real Node.js application (e.g. overnight shifts yielding 0 hours, adjustments vanishing due to SQL timestamp filtering).
  - ⚠️ **Zero Integration:** No HTTP endpoints, no database transactions, no JWT verifications, and no file uploads are tested.

---

### 1.2 `tests/node_audit_test.mjs` (Node.js Native Test Runner)
- **Execution Command:** `node --test tests/node_audit_test.mjs`
- **Result:** **3 PASSED** (179ms)
- **Scope:**
  - Shift time format regex (`^\d{2}:\d{2}$`).
  - Employee code auto-increment parsing math.
  - Grace period minute subtraction.
- **Audit Assessment:** Trivial unit assertions covering 3 utility snippets. Does not touch database queries or Express route handlers.

---

### 1.3 `here/example.spec.js` (Playwright Template)
- **Scope:** Default Playwright template pointing to external domain `https://playwright.dev/`.
- **Audit Assessment:** Completely unconfigured for local application testing. Does not test any project route or workflow.

---

### 1.4 `tests/qa_adversarial_deep_audit.mjs` (Deep Adversarial Reproduction Suite)
- **Execution Command:** `node --test --test-reporter=spec tests/qa_adversarial_deep_audit.mjs`
- **Result:** **9 PASSED** (637ms)
- **Scope:** Uses real in-memory `sql.js` SQLite database instances executing the exact SQL queries, table schemas, and business logic from `server.ts`.
- **Audit Assessment:** **High-value deterministic suite.** Confirmed and proved 9 distinct defects with live SQLite state:
  1. `BUG REPRODUCTION 1`: Adjustments created in month N for month N-1 silently vanish from payroll.
  2. `BUG REPRODUCTION 2`: Overnight shift (20:00 to 04:00) computes 0 hours worked.
  3. `BUG REPRODUCTION 3`: User self-deletion prevention check compares name with email.
  4. `BUG REPRODUCTION 4`: Daily wage worker working on custom off-day gets PKR 0 earnings.
  5. `BUG REPRODUCTION 5`: Half-day attendance receives full 100% daily wage without proration.
  6. `BUG REPRODUCTION 6`: Monthly salary employees get full 100% salary for future unworked month.
  7. `BUG REPRODUCTION 7`: Rapid double-punch on biometric terminal logs immediate check-out with 0 hours worked.
  8. `BUG REPRODUCTION 8`: Direct string interpolation in printFormattedDocument enables Stored XSS.
  9. `BUG REPRODUCTION 9`: Employee onboarding allows NaN or invalid salary if string parsing falls back.

---

## 2. Gap Analysis & Missing Tests

| Feature Area | Current Status | Missing Test Categories Required |
| :--- | :--- | :--- |
| **Authentication Middleware** | Basic token generation verified | Token expiration enforcement, tampered signatures, query param auth leakage. |
| **Authorization / RBAC** | None | Role-escalation tests, testing whether a `cashier` or `manager` can trigger `/api/payroll/calculate` or create users. |
| **ZKTeco ADMS Ingestion** | Unit math only | Live HTTP POST to `/iclock/cdata`, malformed ATTLOG lines, unknown device SN registration, rapid punch debounce. |
| **Employee Documents** | None | File upload MIME-type bypass, directory traversal via `docId` in download, orphaned file cleanup on delete. |
| **Payroll Range Engine** | Unit math only | Non-calendar month cycles (e.g. 26th to 25th), overlapping custom off-dates, prorated absence deduction. |
| **Frontend UI (Playwright)** | None | End-to-end login flow, adding employee, bulk attendance entry, payslip generation. |
