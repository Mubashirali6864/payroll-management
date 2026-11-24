# CODE_AUDIT.md — In-Depth Static Code & Vulnerability Audit

**Specification:** Master Codex Software QA Audit — Phase 2  
**Target Codebase:** Express 4.21 Monolith (`server.ts`, 1,706 lines) & React 19 Client SPA  
**Auditor Principle:** Evidence-based; zero assumptions of correctness; no modifications to production application code.

---

## 1. Logic & Business Engine Defects

### [DEFECT-LOGIC-01] Adjustment Target Month Silent Omission & Misattribution
- **Source Location:** [`server.ts:L902`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L902) & [`server.ts:L1390-1405`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1390-L1405)
- **Classification:** 🔴 **CRITICAL CONFIRMED DEFECT**
- **Description:**  
  When an administrator creates a bonus, fine, or advance recovery via `POST /api/payroll/adjustments`, the server records:
  ```ts
  const payrollId = `pay_${employee_id}_${month}`;
  const now = new Date().toISOString();
  // INSERT INTO payroll_adjustments (id, payroll_id, employee_id, type, amount, description, created_at)
  ```
  `created_at` records the wall-clock timestamp of when the adjustment was entered into the database. However, inside `calculatePayrollForMonth(month)`, the query retrieves adjustments using:
  ```ts
  const adjustments = queryAll(db,
    'SELECT * FROM payroll_adjustments WHERE employee_id = ? AND created_at LIKE ?',
    [emp.id, `${month}%`]
  );
  ```
  If HR adds a performance bonus on September 2nd targeting August payroll (`month = '2026-08'`), the `created_at` timestamp is `'2026-09-02...'`. When calculating August payroll, the SQL query filters by `created_at LIKE '2026-08%'` and returns **zero records**.
- **Impact:**  
  1. The bonus or fine silently disappears from the target month's payroll without error or warning.
  2. When September payroll is calculated, `created_at LIKE '2026-09%'` matches the August bonus, erroneously paying August's bonus in September.
- **Root Cause:** Filtering adjustments by physical row creation timestamp rather than `payroll_id` or target pay period.

---

### [DEFECT-LOGIC-02] Overnight Shift Duration Arithmetic Inversion Collapses to 0.0 Hours
- **Source Location:** [`server.ts:L1020-1024`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1020-L1024), [`server.ts:L316`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L316), [`server.ts:L1093-1097`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1093-L1097)
- **Classification:** 🔴 **HIGH CONFIRMED DEFECT**
- **Description:**  
  In the biometric punch ingestion handler, single attendance override, and bulk attendance override, shift work duration is calculated as follows:
  ```ts
  if (finalInTime && finalOutTime) {
    const [inH, inM] = finalInTime.split(':').map(Number);
    const [outH, outM] = finalOutTime.split(':').map(Number);
    hoursWorked = Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 10) / 10);
  }
  ```
  For an overnight shift (e.g. check-in at 20:00, check-out at 04:00 the following morning):
  - `(outH * 60 + outM) = 4 * 60 = 240`
  - `(inH * 60 + inM) = 20 * 60 = 1200`
  - Minute difference: `240 - 1200 = -960` minutes
  - `Math.max(0, -16.0)` returns `0.0` hours.
- **Impact:** Employees working graveyard or night shifts receive 0 logged work hours on their attendance profile.
- **Root Cause:** Absence of modulo 24-hour rollover math (`if (diff < 0) diff += 24 * 60`).

---

### [DEFECT-LOGIC-03] Work on Scheduled Off-Days Uncredited for Daily Wage Earners
- **Source Location:** [`server.ts:L874-878`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L874-L878) & [`server.ts:L1303-1304`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1303-L1304)
- **Classification:** 🟡 **MEDIUM CONFIRMED DEFECT**
- **Description:**  
  In `calculatePayrollForMonth`:
  ```ts
  for (let d = 1; d <= daysToConsider; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;

    if (empOffDates.has(dateStr)) {
      daysOff++;
      continue; // Skips immediately to next day!
    }

    const att = attRecords.find(a => a.date === dateStr);
    ...
  }
  ```
  If an employee has designated Sunday (e.g. `2026-08-02`) as their custom off-date, but is called in for emergency overtime and punches in/out (recorded as status `'present'` in `attendance`), the loop triggers `continue` at line 877. The attendance row is never inspected.
- **Impact:** For daily wage earners, earnings are computed strictly as `grossEarnings = baseRate * daysPresent`. Because `daysPresent` does not increment on worked off-days, the employee earns PKR 0 for working Sunday.
- **Root Cause:** Static calendar off-day checks unconditionally preempt attendance activity logs.

---

### [DEFECT-LOGIC-04] Half-Day Status Counted as 100% Full Present Day
- **Source Location:** [`server.ts:L883`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L883) & [`AttendanceView.tsx:L202-210`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/AttendanceView.tsx#L202-L210)
- **Classification:** 🟡 **MEDIUM CONFIRMED DEFECT**
- **Description:**  
  In `calculatePayrollForMonth`:
  ```ts
  if (att.status === 'present' || att.status === 'half_day') {
    daysPresent++;
  }
  ```
  A `half_day` status awards 1 full present day. Daily wage workers receive 100% of their base daily wage for working only half of their shift. Furthermore, in `AttendanceView.tsx` and `server.ts:L1009`, `half_day` is omitted from time defaulting branches, causing `finalInTime` and `finalOutTime` to remain undefined unless manually typed by an admin.
- **Impact:** Labor overpayment and unhandled UI state in attendance editor.

---

### [DEFECT-LOGIC-05] Future Month Payroll Computes 100% Base Salary for 0 Days Worked
- **Source Location:** [`server.ts:L846-852`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L846-L852) & [`server.ts:L925-931`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L925-L931)
- **Classification:** 🟡 **MEDIUM CONFIRMED DEFECT**
- **Description:**  
  For future months, `daysToConsider` evaluates to `0`. Consequently, `daysPresent = 0`, `daysOff = 0`, and `daysAbsent = 0`.
  In the monthly salary computation:
  ```ts
  grossEarnings = emp.base_salary;
  absentDeductions = Math.round(perDayRate * daysAbsent); // perDayRate * 0 = 0
  netPayout = grossEarnings - absentDeductions + totalBonuses - totalFines - advanceDeductions;
  ```
  Every monthly employee is calculated as earning 100% of their full monthly base salary for an unelapsed future month.
- **Impact:** Premature financial reporting distortion and unearned payout generation.

---

## 2. React & Frontend State Defects

### [DEFECT-REACT-01] Cascading Unawaited Asynchronous Handlers Race Condition
- **Source Location:** [`App.tsx:L294-324`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/App.tsx#L294-L324)
- **Classification:** 🟡 **MEDIUM CONFIRMED DEFECT**
- **Description:**  
  In `handleAddAdjustment`:
  ```ts
  const handleAddAdjustment = async (adjData: any) => {
    const res = await authFetch('/api/payroll/adjustments', { ... });
    if (res.ok) {
      handleCalculatePayroll(selectedMonth); // NOT awaited!
    }
  };
  ```
  Inside `handleCalculatePayroll`:
  ```ts
  const handleCalculatePayroll = async (month: string) => {
    const res = await authFetch('/api/payroll/calculate', { ... });
    if (res.ok) {
      const records = await res.json();
      setPayrollRecords(records);
      loadData(); // NOT awaited, calls loadPayroll() in background!
    }
  };
  ```
  `setPayrollRecords(records)` sets state with the calculated response. Meanwhile, `loadData()` calls `loadPayroll()`, sending a secondary `GET /api/payroll/records` request. If the secondary request resolves after the calculation response, stale records overwrite the updated state, causing newly applied adjustments to disappear from the screen.

### [DEFECT-REACT-02] Stale Closure in `useEffect` in `App.tsx`
- **Source Location:** [`App.tsx:L122-124`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/App.tsx#L122-L124)
- **Classification:** 🟡 **MEDIUM CONFIRMED DEFECT**
- **Description:**  
  `useEffect(() => { loadData(); }, [selectedDate]);` invokes `loadData`, which is unmemoized and closes over `selectedMonth`. Changing the date picker triggers `loadPayroll(selectedMonth)` in the background, tightly coupling date changes with monthly payroll refetches.

### [DEFECT-REACT-03] Dark-to-Light Flash of Unstyled Content (FOUC)
- **Source Location:** [`index.html:L11`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/index.html#L11) & [`App.tsx:L327`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/App.tsx#L327)
- **Classification:** 🟢 **LOW CONFIRMED DEFECT**
- **Description:**  
  `index.html` sets `<body class="bg-[#0b0f19] text-slate-100 font-sans antialiased ...">` (dark mode shell). When React mounts, the application container renders `className="min-h-screen bg-[#f0f2f5] text-gray-800 ..."` (light mode). Users experience a prominent black-to-gray screen flash during initial page load.

---

## 3. Next.js vs. SPA Architectural Audit

- **Repository Reality:** The codebase is built with **Vite 6 + React 19** on the frontend and an **Express 4.21** server on the backend. No Next.js framework files exist.
- **Architectural Findings:**
  - **No React Error Boundaries:** Uncaught exceptions in rendering (e.g. malformed payslip data) crash the entire application to an unrecoverable blank white screen.
  - **Monolithic Single File Server (`server.ts`):** 1,706 lines containing routing, validation, ADMS protocol handling, Vite middleware, SQLite execution, and duplicated payroll algorithms (`calculatePayrollForMonth` vs `/api/payroll/range`).
  - **Duplicated Payroll Engine:** Lines 821-993 and lines 1266-1382 maintain two independent implementations of absence classification and earnings calculation. Fixes applied to one are not automatically reflected in the other.

---

## 4. API & Protocol Vulnerabilities

### [DEFECT-API-01] Unauthenticated Financial Dashboard Metrics Endpoint
- **Source Location:** [`server.ts:L1452`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1452)
- **Classification:** 🔴 **HIGH CONFIRMED VULNERABILITY (CWE-306)**
- **Description:**  
  `app.get('/api/dashboard/metrics', (req: Request, res: Response) => { ... })` lacks `authMiddleware` and `requirePermission`. Any unauthenticated user or external bot can query:
  - Total active employee headcount
  - `today_payroll_accrual`
  - `monthly_payroll_estimate`
  - `monthly_salary_baseline`
  - `daily_wage_baseline`
- **Impact:** Unauthorized public exposure of confidential company compensation metrics and payroll liability.

### [DEFECT-API-02] Self-Deletion Check Logic Failure Allows Admin Self-Lockout
- **Source Location:** [`server.ts:L1649`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L1649)
- **Classification:** 🟡 **MEDIUM CONFIRMED VULNERABILITY (CWE-284)**
- **Description:**  
  ```ts
  if (targetUser?.name === user.email) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  ```
  `targetUser.name` contains the user's display name (e.g. `"Super Administrator"`), whereas `user.email` contains their email address (e.g. `"admin@mohsinco.com"`). Because they are never equal, the self-deletion check is bypassed. An admin can delete their own user row, causing permanent system lockout.

### [DEFECT-API-03] Biometric Accidental Double-Punch Causes Immediate 0-Hour Check-Out
- **Source Location:** [`server.ts:L302-323`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L302-L323)
- **Classification:** 🟡 **MEDIUM CONFIRMED DEFECT**
- **Description:**  
  In `processBiometricPunch`:
  ```ts
  const existingAtt = queryOne(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [emp.id, punchDate]);
  if (!existingAtt) {
    // First punch = Check-In
  } else {
    // Subsequent punch = Check-Out
    const checkInTime = existingAtt.check_in_time || '09:00:00';
    const hoursWorked = Math.max(0, Math.round(((punchHour * 60 + punchMin) - (cInH * 60 + cInM)) / 60 * 10) / 10);
    UPDATE attendance SET check_out_time = ?, hours_worked = ? ...
  }
  ```
  If an employee scans their fingerprint twice within 10 seconds (at 09:00:00 and 09:00:10), punch #2 immediately overwrites `check_out_time = '09:00:10'` and calculates `hours_worked = 0.0`. The system lacks a minimum punch debounce threshold (e.g. 5–15 minutes).

---

## 5. Database Architecture & Integrity Issues

### [DEFECT-DB-01] sql.js In-Memory Multi-Process Incoherency
- **Source Location:** [`src/db/database.ts:L5-42`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/db/database.ts#L5-L42)
- **Classification:** 🔴 **HIGH ARCHITECTURAL DEFECT**
- **Description:**  
  `sql.js` operates purely in Node.js process heap memory. In clustered environments (PM2 cluster mode, Passenger, or multi-container instances), each worker holds an isolated in-memory database instance. Writes performed in Worker A are invisible to Worker B. When Worker B saves to disk, it overwrites `data/payroll.sqlite` with its stale memory snapshot.

### [DEFECT-DB-02] Non-Atomic Disk Writes
- **Source Location:** [`src/db/database.ts:L38`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/db/database.ts#L38)
- **Classification:** 🟡 **MEDIUM RELIABILITY DEFECT**
- **Description:**  
  `fs.writeFileSync(DB_PATH, buffer)` overwrites the live SQLite database in-place on every SQL write. If the process is terminated or experiences power loss during `writeFileSync`, the file becomes corrupt or zero bytes.

### [DEFECT-DB-03] Missing Foreign Key Cascades & Disk Leaks
- **Source Location:** [`src/db/database.ts:L56-124`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/db/database.ts#L56-L124) & [`server.ts:L576-582`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L576-L582)
- **Classification:** 🟡 **MEDIUM DEFECT**
- **Description:**  
  SQLite tables lack `ON DELETE CASCADE`. When an employee is deleted, orphaned records remain permanently in `attendance`, `payroll`, `payroll_adjustments`, and `employee_documents`. Physical files stored in `data/documents/<id>/` are never unlinked from disk.

---

## 6. Security Vulnerabilities

### [DEFECT-SEC-01] Stored Cross-Site Scripting (XSS) in Print Templates
- **Source Location:** [`ReportsView.tsx:L158-185`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/ReportsView.tsx#L158-L185) & [`PayrollView.tsx:L174`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/PayrollView.tsx#L174)
- **Classification:** 🟡 **MEDIUM CONFIRMED VULNERABILITY (CWE-79)**
- **Description:**  
  Employee names, designations, department names, and company logo URLs are concatenated directly into raw HTML template strings and rendered via `printWin.document.write(contentHtml)`. Setting an employee name or logo URL with payload `<img src=x onerror="alert(document.cookie)">` executes arbitrary JavaScript in the context of the user's session.

### [DEFECT-SEC-02] Committed Production JWT Secret in Repository
- **Source Location:** [`.env:L4`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/.env#L4)
- **Classification:** 🟡 **MEDIUM SECURITY HYGIENE ISSUE (CWE-798)**
- **Description:**  
  The `.env` file contains `JWT_SECRET=8f4k2m9n3p7q5r1t6w8y0u2i4o6p8a9s`. Because this secret is committed in the workspace root, any person with repository access can sign valid administrative JWT tokens.

### [DEFECT-SEC-03] Hardcoded Production Credentials Pre-Filled in UI
- **Source Location:** [`LoginPage.tsx:L6-7, L85`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/components/LoginPage.tsx#L6-L7)
- **Classification:** 🟢 **LOW SECURITY ISSUE**
- **Description:**  
  The login component pre-populates form state with `admin@mohsinco.com` and `changeme123`, and renders them in plaintext at the bottom of the form.
