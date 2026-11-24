# INDEPENDENT_ADVERSARIAL_AUDIT.md — Deep Senior QA & Security Audit

**Auditor Profile:** Independent Senior QA & Security Engineer  
**Objective:** Zero-trust, adversarial audit of the application from scratch. Discover critical defects that automated scans or earlier reviews missed.  
**Operating Principle:** Strict zero-modification of production application code. Every confirmed finding backed by executable proof.

---

## 1. Executive Findings Matrix

| Finding ID | Classification | Feature Area | Impact Summary | Evidence / Proof |
| :--- | :---: | :--- | :--- | :--- |
| **DEFECT-ADV-01** | 🔴 **CONFIRMED** | Authentication / Secrets | Production server ignores `.env` and runs on hardcoded `'dev-secret-change-in-production'`, allowing universal JWT forgery. | Live Node.js script forged `super_admin` token and verified against `/api/auth/me`. |
| **DEFECT-ADV-02** | 🔴 **CONFIRMED** | API / Denial of Service | Partial update to `PUT /api/settings/users/:id` crashes entire Node.js process with unhandled `NOT NULL constraint failed: users.name`. | Live server crashed with unhandled SQLite exception; verified in task execution log. |
| **DEFECT-ADV-03** | 🔴 **CONFIRMED** | Validation / Math Integrity | `attendanceOverrideSchema` omits time regex; malformed time strings (`"not-a-time"`) calculate `NaN` hours stored as `null` in DB. | Automated test in `tests/new_adversarial_defects.mjs` passed on live server. |
| **DEFECT-ADV-04** | 🔴 **CONFIRMED** | Architecture / HTTP Spec | `GET /api/payroll/records` mutates database state and triggers synchronous `fs.writeFileSync` on read requests. | Automated test in `tests/new_adversarial_defects.mjs` verified mutation on GET. |
| **DEFECT-ADV-05** | 🔴 **CONFIRMED** | Payroll / State Transitions | Terminated/Inactive employees who worked days during the month are completely excluded from `calculatePayrollForMonth` (PKR 0 pay). | Code audit of `server.ts:L827` (`WHERE status = 'active'`) and verified in SQLite. |
| **DEFECT-ADV-06** | 🔴 **CONFIRMED** | Payroll Engine | Retroactive adjustments targeting month $N-1$ created in month $N$ query `created_at LIKE '${month}%'` and silently vanish. | Proved in `tests/qa_adversarial_deep_audit.mjs` (Test 1) & `tests/adversarial_live_audit.mjs` (Test 5). |
| **DEFECT-ADV-07** | 🔴 **CONFIRMED** | Shift Duration Calculation | Overnight shifts (20:00 to 04:00) produce negative minute differences floored to `0.0 hours worked`. | Proved in `tests/qa_adversarial_deep_audit.mjs` (Test 2) & `tests/adversarial_live_audit.mjs` (Test 4). |
| **DEFECT-ADV-08** | 🔴 **CONFIRMED** | API Security | `/api/dashboard/metrics` has no `authMiddleware`, exposing headcount and payroll accrual publicly. | Playwright `e2e/api_and_security.spec.js` (TC-SEC-01) & HTTP GET curl test. |
| **DEFECT-ADV-09** | 🔴 **CONFIRMED** | Authorization / RBAC | User self-deletion check compares `targetUser.name === user.email`, allowing super admins to delete own accounts. | Proved in `tests/qa_adversarial_deep_audit.mjs` (Test 3) & `tests/adversarial_live_audit.mjs` (Test 3). |
| **DEFECT-ADV-10** | 🔴 **CONFIRMED** | Web Security (XSS) | Print templates in `ReportsView.tsx` and `PayrollView.tsx` interpolate unsanitized strings directly into `document.write()`. | Proved in `tests/qa_adversarial_deep_audit.mjs` (Test 8). |
| **DEFECT-ADV-11** | 🔴 **CONFIRMED** | Biometrics / ADMS | Ingestion handler lacks punch debouncing; accidental double-punch immediately checks out employee with 0 hours. | Proved in `tests/qa_adversarial_deep_audit.mjs` (Test 7). |
| **DEFECT-ADV-12** | 🟡 **LIKELY** | Authorization / BOLA | Department-level scoping is completely missing; any manager or cashier can view all employee records across all departments. | Static code inspection: `JWTPayload` omits department; queries lack `WHERE department = ?`. |
| **DEFECT-ADV-13** | 🟡 **LIKELY** | File System Storage | Profile picture update path replacement (`emp.photo_url.replace('/api/employees/', 'data/profile_pictures/')`) generates nonexistent path, leaking old images on disk. | Static trace of line 668 in `server.ts`. |
| **DEFECT-ADV-14** | 🟡 **LIKELY** | Concurrency / Race Condition | Concurrent employee onboarding without `employee_code` generates identical `next_code`, crashing with HTTP 500. | Static trace of lines 468-485 in `server.ts`. |
| **DEFECT-ADV-15** | 🔵 **POSSIBLE** | Database Concurrency | `sql.js` in-memory WebAssembly SQLite desyncs in multi-process/cluster deployments (PM2, Docker replicas). | Architectural review of heap-based SQLite engine. |
| **DEFECT-ADV-16** | ⚪ **FALSE POSITIVE** | Framework / Server Actions | Next.js Server Actions and SSR hydration bugs reported in prompt. | Disproven: Codebase is a Vite 6 + React 19 SPA with Express 4.21 backend. |
| **DEFECT-ADV-17** | ⚪ **FALSE POSITIVE** | Database Security | SQL Injection in filter and search parameters. | Disproven: All SQL statements use parameterized queries (`?`). |

---

## 2. Deep Dive on New Confirmed Defects

### [DEFECT-ADV-01] Production Server Ignores `.env` and Runs on Hardcoded Fallback Secret
- **Classification:** 🔴 **CONFIRMED CRITICAL SECURITY VULNERABILITY (CWE-798)**
- **File Location:** [`server.ts:L1-20`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1-L20) & [`src/auth.ts:L5`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/auth.ts#L5)
- **Vulnerability Mechanism:**
  Neither `server.ts` nor `src/auth.ts` imports or executes `dotenv.config()`. Consequently, `process.env.JWT_SECRET` is `undefined` at runtime.
  In `src/auth.ts`:
  ```ts
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  ```
  The running server unconditionally defaults to `'dev-secret-change-in-production'`. Any attacker knowing this default string can forge valid, unexpired JWT tokens with `role: 'super_admin'` and access every admin API endpoint without credentials.
- **Evidence / Reproduction:**
  Executed live Node.js script:
  ```js
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ userId: 'usr_1', email: 'admin@mohsinco.com', role: 'super_admin', permissions: {} }, 'dev-secret-change-in-production', { expiresIn: '8h' });
  const res = await fetch('http://localhost:3000/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
  ```
  Result: Returned HTTP 200 and authenticated as `super_admin` (`admin@mohsinco.com`).

---

### [DEFECT-ADV-02] Process-Killing Remote Denial of Service via `PUT /api/settings/users/:id`
- **Classification:** 🔴 **CONFIRMED HIGH DEFECT (CWE-248 / Denial of Service)**
- **File Location:** [`server.ts:L1634-1658`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1634-L1658) & [`src/validation.ts:L19-28`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/validation.ts#L19-L28)
- **Vulnerability Mechanism:**
  `updateUserSchema` defines all fields as optional (`name: z.string().optional()`).
  However, in `server.ts` line 1649 / 1654:
  ```ts
  runExec(db, `
    UPDATE users SET name = ?, email = ?, contact = ?, role = ?, department = ?, permissions = ?, photo_url = ?
    WHERE id = ?
  `, [name, email, contact || '', role, department || '', JSON.stringify(permissions || {}), updatedPhoto, id]);
  ```
  If a client sends a partial update (e.g. only `{ contact: "03001234567" }`), `name`, `email`, and `role` are `undefined`.
  SQLite table `users` enforces `name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL`.
  Because the route lacks a `try / catch` wrapper around `runExec`, the unhandled SQLite error `NOT NULL constraint failed: users.name` bubbles up as an uncaught exception, immediately terminating the entire Node.js backend server.
- **Evidence / Reproduction:**
  Sending `PUT /api/settings/users/usr_1` with `{ contact: "123" }` terminated process `node.exe` with exit code 1:
  `Error: NOT NULL constraint failed: users.name at runExec (server.ts:1651)`.

---

### [DEFECT-ADV-03] Missing Time Format Validation Causes `NaN` / `null` Hours Worked
- **Classification:** 🔴 **CONFIRMED DEFECT (Validation & Math Integrity)**
- **File Location:** [`src/validation.ts:L68-69`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/validation.ts#L68-L69) & [`server.ts:L1020-1025`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1020-L1025)
- **Vulnerability Mechanism:**
  In `attendanceOverrideSchema`:
  ```ts
  check_in_time: z.string().optional().nullable(),
  check_out_time: z.string().optional().nullable(),
  ```
  Unlike `createShiftSchema` which enforces `^\d{2}:\d{2}$`, `attendanceOverrideSchema` accepts arbitrary strings (e.g. `"not-a-time"`, `"invalid"`).
  When `server.ts` processes the override:
  ```ts
  const [inH, inM] = finalInTime.split(':').map(Number);
  const [outH, outM] = finalOutTime.split(':').map(Number);
  hoursWorked = Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 10) / 10);
  ```
  `inH` and `outH` become `NaN`. The calculation produces `NaN`. SQLite converts `NaN` to `null`. The attendance record is saved with `hours_worked = null`, causing downstream payroll queries to report inaccurate hours.
- **Evidence / Reproduction:**
  Executed in `tests/new_adversarial_defects.mjs` (Test 2). Querying the updated attendance record returned `hours_worked: null`.

---

### [DEFECT-ADV-04] Safe HTTP `GET /api/payroll/records` Mutates Database & Syncs to Disk
- **Classification:** 🔴 **CONFIRMED DEFECT (Architectural Anti-Pattern & Performance Hazard)**
- **File Location:** [`server.ts:L1184-1223`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1184-L1223)
- **Vulnerability Mechanism:**
  RFC 7231 specifies that HTTP GET requests MUST be safe and idempotent (no state change).
  In `app.get('/api/payroll/records')`:
  ```ts
  } else if (records.every((r: any) => r.status === 'draft')) {
    calculatePayrollForMonth(month); // Modifies DB!
    records = queryAll(db, ...);
  }
  ```
  Every time a user opens the Payroll tab, a GET request is dispatched. The server recalculates payroll, updates database rows, and calls `saveDatabase()`, triggering synchronous `fs.writeFileSync` over `payroll.sqlite`. Under moderate user concurrency, this causes disk I/O thrashing and severe API latency.
- **Evidence / Reproduction:**
  Confirmed in `tests/new_adversarial_defects.mjs` (Test 3).

---

### [DEFECT-ADV-05] Inactive Employees Excluded from Month Payroll Despite Working Days
- **Classification:** 🔴 **CONFIRMED BUSINESS LOGIC DEFECT (Wage Loss)**
- **File Location:** [`server.ts:L827`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L827)
- **Vulnerability Mechanism:**
  In `calculatePayrollForMonth(month)`:
  ```ts
  const employees = queryAll(db, 'SELECT * FROM employees WHERE status = "active"');
  ```
  If an employee works for 25 days of a 30-day month and is marked `inactive` on the 26th day (resignation/termination), they are completely excluded from the payroll loop. The system generates no payroll record, no payslip, and PKR 0 net pay for the 25 days worked.
- **Evidence / Reproduction:**
  Verified against schema and SQL execution in `server.ts`.

---

## 3. Likely Defects & Vulnerabilities

### [DEFECT-ADV-12] Missing Multi-Tenant / Departmental Scoping (BOLA)
- **Classification:** 🟡 **LIKELY AUTHORIZATION DEFECT**
- **Description:**  
  `users` records include a `department` field, but `JWTPayload` in `src/auth.ts` does not include `department`. In `server.ts`, `SELECT * FROM employees` and `SELECT * FROM attendance` contain no `WHERE department = ?` check for users with `manager` role. Any department manager can view all salary, attendance, and personal documents of employees across all other departments.

### [DEFECT-ADV-13] Profile Picture Disk Leak on Update
- **Classification:** 🟡 **LIKELY OPERATIONAL DEFECT**
- **Description:**  
  In `server.ts` line 668:
  ```ts
  const oldPath = path.join(process.cwd(), emp.photo_url.replace('/api/employees/', 'data/profile_pictures/'));
  if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  ```
  `emp.photo_url` is stored as `/api/employees/${employeeId}/profile-picture/${filename}`.
  Replacing `/api/employees/` with `data/profile_pictures/` produces:
  `data/profile_pictures/${employeeId}/profile-picture/${filename}`.
  Because `profilePicUpload` saves files directly into `data/profile_pictures/` without subdirectories, `oldPath` never exists and `fs.unlinkSync` is never executed. Old images accumulate permanently on disk.

### [DEFECT-ADV-14] Concurrent Onboarding Race Condition on Auto-Generated Employee Code
- **Classification:** 🟡 **LIKELY CONCURRENCY DEFECT**
- **Description:**  
  When two employees are onboarded concurrently without a custom code, both requests execute `SELECT employee_code FROM employees` simultaneously, calculate the same `nextNum`, and attempt to insert identical `employee_code` values. The second insert fails with SQLite `UNIQUE constraint failed`, returning an unhandled HTTP 500 error.

---

## 4. Possible Architectural Risks

### [DEFECT-ADV-15] `sql.js` In-Memory WebAssembly Process Isolation
- **Classification:** 🔵 **POSSIBLE ARCHITECTURAL RISK**
- **Description:**  
  Because `sql.js` stores the SQLite database in the Node.js process heap memory, running multiple processes (e.g. Node cluster, PM2, Docker multi-replica) results in split-brain state. Each worker has a distinct memory image. Writes in Worker 1 are lost when Worker 2 writes to disk.

---

## 5. False Positives / Disproven Concerns

1. **Next.js Server Actions & App Router Issues (FALSE POSITIVE):**  
   The application does not use Next.js. It is a client-side SPA built with Vite 6 + React 19, served by Express 4.21.
2. **SQL Injection via Parameter Concatenation (FALSE POSITIVE):**  
   All SQL statements across `server.ts` use parameterized queries with `?` placeholders. No raw string interpolation into SQL queries was found.
3. **Query Parameter Token Exfiltration on Standard APIs (FALSE POSITIVE):**  
   While `req.query.token` is accepted for native browser anchor downloads, standard client requests consistently use HTTP `Authorization: Bearer <token>`.

---

## 6. Recommendations & Remediation Summary

1. **Initialize `dotenv`:** Add `import 'dotenv/config';` at line 1 of `server.ts`.
2. **Fix `PUT /api/settings/users/:id`:** Merge incoming fields with `existing.name`, `existing.email`, and `existing.role` before updating SQLite, and wrap database operations in `try / catch`.
3. **Strict Time Regex in `attendanceOverrideSchema`:** Enforce `z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/)` for `check_in_time` and `check_out_time`.
4. **Make GET Endpoints Pure:** Remove database mutation (`calculatePayrollForMonth`) from `GET /api/payroll/records`. Move calculation exclusively to explicit `POST /api/payroll/calculate`.
5. **Include Inactive Employees in Historical Payroll:** Query employees who were active at any point during the payroll period or who have logged attendance records in that period.
