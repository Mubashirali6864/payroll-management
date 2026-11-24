# Mohsin & Co Payroll & Attendance Management System
## Testing Process, Quality Gates & Verification Protocol

**Document Version**: 2.2.0  
**Target Audience**: Software Engineers, QA Leads, Release Managers, AI Agents  
**Companion Documents**:
- Product Requirements: [PRD.md](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/PRD.md)
- System Walkthrough: [SYSTEM_WALKTHROUGH_AND_EXPECTED_BEHAVIOR.md](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/SYSTEM_WALKTHROUGH_AND_EXPECTED_BEHAVIOR.md)
- Agent Operating Standards: [AGENTS.md](file:///e:/Softwares/Payroll%20Management%20-%20Copy/AGENTS.md)

---

## 1. Testing Philosophy & Core Principles

This repository enforces **Mandatory TDD, Adversarial Verification, and Zero-Defect Quality Gates**. Code cannot be deployed or delivered without passing every stage of the verification protocol.

```
+-----------------------------------------------------------------------------------+
|                            THE TDD & QA CYCLE                                     |
|                                                                                   |
|    1. RED          -->      2. GREEN        -->      3. REFACTOR & HARDEN         |
|    Write test first         Implement minimal        Type safety, formatting,     |
|    Confirm it fails         code to pass tests       Inter font, clean UI polish  |
|           |                                                      |                |
|           +<---------------- 4. ADVERSARIAL MUTATION <-----------+                |
|                              Intentionally break logic                            |
|                              Verify test catches defect                           |
|                              Revert and re-verify                                 |
+-----------------------------------------------------------------------------------+
```

### Core Verification Rules
1. **Mandatory RED Step**: Tests are authored first to assert the exact business requirements before editing implementation code.
2. **Reverse Verification / Mutation Testing**: After completing an implementation, developers/agents MUST temporarily mutate a business boundary (e.g., alter the integer rounding formula or change daily wage payout) to confirm the automated suite fails immediately. If tests pass with broken logic, the test suite is inadequate.
3. **Zero Undeclared Variables**: Every variable, import, and handler must be explicitly typed in TypeScript with zero compiler errors.
4. **Mandatory Post-Edit Graph Update**: After any TS/JS modification, run `.\graphify.cmd update .` to keep knowledge graph AST nodes and call-graphs synchronized.

---

## 2. Test Suite Catalog & Test Architecture

The test infrastructure is organized under `tests/` and executed using the native Node.js Test Runner (`node --test`).

| Test Suite File | Type | Target Scope & Assertions |
| :--- | :--- | :--- |
| [`tests/comprehensive_deep_qa_audit.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/comprehensive_deep_qa_audit.mjs) | Deep QA Integration | 20 test suites verifying Super Admin auth, HR auth, rate limit immunity, RBAC, employee CRUD, biometric debouncing, daily roster synthesis, weekly off-days, manual overrides, payroll proration, adjustments, dashboard metrics, and audit logs. |
| [`tests/payroll_summary_and_daily_wage_fix_test.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/payroll_summary_and_daily_wage_fix_test.mjs) | Domain Unit Test | Verifies that Daily Wage staff month-end pending net payout is `0` (cleared daily in cash), top summary gross is PKR 50,168, and month-end payout is strictly PKR 23,232. |
| [`tests/dashboard_employee_filter_test.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/dashboard_employee_filter_test.mjs) | UI & State Unit Test | Verifies segmented model filters (`All`, `Monthly`, `Daily Wage`) correctly partition employees and sync with Dashboard navigation. |
| [`tests/daily_rate_rounding_test.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/daily_rate_rounding_test.mjs) | Arithmetic Unit Test | Asserts integer daily rate rounding (`Math.round(30000 / 31) === 968`) and integer absence cut (`Math.round(968 * 2) === 1936`). |
| [`tests/daily_wage_payslip_today_test.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/daily_wage_payslip_today_test.mjs) | Payslip Unit Test | Asserts daily wage voucher displays today's wage rate (PKR 1,000) rather than a monthly accumulated total. |
| [`tests/user_requests_verification.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/user_requests_verification.mjs) | Regression / Acceptance | 6 test suites asserting explicit absence preservation, off-days in payroll, and employee detail modal breakdown. |
| [`tests/p1_regression.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/p1_regression.mjs) & [`p2_regression.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/p2_regression.mjs) | Release Regression | Multi-month payroll recalibration, biometric edge cases, and role permission enforcement. |
| [`tests/p0_adversarial_attack.mjs`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/tests/p0_adversarial_attack.mjs) | Security & Adversarial | Malformed payloads, SQL injection injection vectors, and unauthorized reactivation attempts. |

---

## 3. The 7 Mandatory Quality Gates (Execution Steps)

Before any code delivery or release sign-off, all seven quality gates must be executed sequentially:

```
[ Gate 1: TypeScript ]  -->  [ Gate 2: Deep QA ]      -->  [ Gate 3: Unit Tests ]
     tsc --noEmit              deep_qa_audit.mjs             payroll/filter/round
          |
          v
[ Gate 4: Production ]  -->  [ Gate 5: Server Live ]  -->  [ Gate 6: Graphify ]
     node build.js             HTTP 200/401 :3000            graphify update .
          |
          v
[ Gate 7: Mutation ]
   Intentional defect & revert confirmation
```

### Gate 1: TypeScript Static Typecheck
Validates strict type-safety, import resolution, and variable declarations.
```powershell
node ./node_modules/typescript/bin/tsc --noEmit
```
*Requirement*: Must exit with code `0` and **0 errors**.

### Gate 2: Comprehensive Deep QA Audit Suite
Executes the complete 20-suite operational and integration test harness.
```powershell
node --test tests/comprehensive_deep_qa_audit.mjs
```
*Requirement*: **20/20 test suites pass**.

### Gate 3: Domain Unit & Business Logic Tests
Verifies daily wage cash isolation, integer daily rate rounding, and dashboard filter routing.
```powershell
node --test tests/payroll_summary_and_daily_wage_fix_test.mjs tests/dashboard_employee_filter_test.mjs tests/daily_rate_rounding_test.mjs tests/daily_wage_payslip_today_test.mjs
```
*Requirement*: **All subtests pass (0 failed)**.

### Gate 4: Production Compilation Check
Builds the Vite client bundle and the esbuild backend production server.
```powershell
node build.js
```
*Requirement*: Generates `./dist` bundles cleanly without compilation warnings.

### Gate 5: Development Server Liveness
Verifies that the Express API and Vite dev server are actively responding on port 3000.
```powershell
powershell -Command "Invoke-RestMethod -Uri 'http://localhost:3000/api/settings/company' -Method Get"
```
*Requirement*: Responds with HTTP 401 (`{"error":"Authentication required"}`), confirming authentication middleware and API router are live and operational.

### Gate 6: Knowledge Graph Synchronization
Re-indexes local AST symbols and community relationships.
```powershell
.\graphify.cmd update .
```
*Requirement*: Knowledge graph rebuilt with 0 errors (`graphify-out/graph.json` updated).

### Gate 7: Adversarial Mutation Verification ("Break & Reverse")
1. Temporarily introduce a defect (e.g. change `Math.round(perDayRate * daysAbsent)` to `perDayRate * daysAbsent` without rounding).
2. Run `node --test tests/daily_rate_rounding_test.mjs`. Confirm the test catches the fractional failure.
3. Revert the file and re-run all tests. Confirm all tests pass cleanly.

---

## 4. Expected Test Outputs & Assertion Standards

### A. Deep QA Audit Output Reference
```
TAP version 13
# Subtest: 1.1 Super Admin Authentication succeeds with valid credentials
ok 1 - 1.1 Super Admin Authentication succeeds with valid credentials
# Subtest: 1.2 HR Admin Authentication succeeds with valid credentials
ok 2 - 1.2 HR Admin Authentication succeeds with valid credentials
# Subtest: 1.3 Failed logins return 401 and are NOT blocked by rate limiting
ok 3 - 1.3 Failed logins return 401 and are NOT blocked by rate limiting
# Subtest: 1.4 Unauthenticated requests to protected endpoints return 401
ok 4 - 1.4 Unauthenticated requests to protected endpoints return 401
# Subtest: 1.5 Role-based access control: Cashier cannot calculate payroll
ok 5 - 1.5 Role-based access control: Cashier cannot calculate payroll
# Subtest: 2.1 Employee creation validates required fields and sets initial values
ok 6 - 2.1 Employee creation validates required fields and sets initial values
# Subtest: 2.2 Duplicate Employee ID/Code is rejected with 409 Conflict
ok 7 - 2.2 Duplicate Employee ID/Code is rejected with 409 Conflict
# Subtest: 2.3 Partial update merges fields without clearing unmentioned properties
ok 8 - 2.3 Partial update merges fields without clearing unmentioned properties
# Subtest: 3.1 On-time biometric punch logs check-in with present status
ok 9 - 3.1 On-time biometric punch logs check-in with present status
# Subtest: 3.2 Rapid double punch within 5 minutes is debounced
ok 10 - 3.2 Rapid double punch within 5 minutes is debounced
# Subtest: 4.1 Daily roster synthesizes records for all active employees
ok 11 - 4.1 Daily roster synthesizes records for all active employees
# Subtest: 4.2 Unrecorded Sunday correctly synthesizes weekly_off status
ok 12 - 4.2 Unrecorded Sunday correctly synthesizes weekly_off status
# Subtest: 4.3 Single manual override persists and sets is_manual_override = 1
ok 13 - 4.3 Single manual override persists and sets is_manual_override = 1
# Subtest: 4.4 Bulk attendance override persists multi-date entries without data loss
ok 14 - 4.4 Bulk attendance override persists multi-date entries without data loss
# Subtest: 5.1 Payroll calculation for monthly salary prorates absent days accurately
ok 15 - 5.1 Payroll calculation for monthly salary prorates absent days accurately
# Subtest: 5.2 Adding adjustment (bonus & fine) immediately reflects in payroll
ok 16 - 5.2 Adding adjustment (bonus & fine) immediately reflects in payroll
# Subtest: 5.3 GET /api/payroll/range computes prorated compensation across arbitrary window
ok 17 - 5.3 GET /api/payroll/range computes prorated compensation across arbitrary window
# Subtest: 6.1 Dashboard metrics sum coherently without double counting
ok 18 - 6.1 Dashboard metrics sum coherently without double counting
# Subtest: 6.2 Audit logs record mutating actions with user identity
ok 19 - 6.2 Audit logs record mutating actions with user identity
# Subtest: 7.1 Teardown: Delete test employee
ok 20 - 7.1 Teardown: Delete test employee
1..20
# tests 20 | pass 20 | fail 0
```

### B. Business Logic Unit Tests Output Reference
```
TAP version 13
# Subtest: Payroll Register & Summary Totals: Daily Wage month-end net payout is 0 (cleared daily in cash) so total payout equals monthly staff net only
ok 1 - Daily Wage month-end net payout is 0 (cleared daily in cash)
# Subtest: HR Management & Dashboard Navigation Filter: Filter correctly separates monthly vs daily wage employees
ok 2 - Filter correctly separates monthly vs daily wage employees
1..2
# tests 2 | pass 2 | fail 0
```

---

## 5. Troubleshooting & Continuous Verification FAQ

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| `TypeError: Cannot read properties of undefined` | Missing state initialization or optional chaining on attendance records. | Inspect schema and add fallback defaults `r.days_off ?? 0`. Run Gate 1 (`tsc --noEmit`). |
| Rate limiting error during rapid test suite execution | Rate limiter triggered on login endpoints. | Confirm `tests/comprehensive_deep_qa_audit.mjs` test 1.3 passes; verify rate limiter was neutralized for local test suites. |
| Inactive employees appearing in Dashboard counters | Unscoped SQL query or count badge reading raw length. | Scope counter to `statusFilter === 'active'` in `EmployeeManagementView.tsx`. |
| Rounding mismatch (e.g. `1,935` instead of `1,936`) | Using floating-point daily rate division without `Math.round`. | Apply `Math.round(base_salary / daysInMonth)` before multiplying by absence days. |
