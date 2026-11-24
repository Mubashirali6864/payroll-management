# OPEN.md — Open Architectural & Operational Risks

**Specification:** Master Codex Software QA Audit — Phase 10 Open Deliverable  
**Auditor Principle:** Document systemic, deployment, and concurrency risks requiring user architectural decisions.

---

## 1. [RISK-ARCH-01] `sql.js` In-Memory WebAssembly Multi-Process Concurrency Desync
- **Severity:** 🔴 **HIGH ARCHITECTURAL RISK**
- **Files Involved:** [`mohsin-&-co-payroll-&-attendance/src/db/database.ts:L5-42`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/db/database.ts#L5-L42)
- **Description:**  
  The database engine runs purely in Node.js process heap memory via `sql.js`. In clustered production deployments (PM2 cluster mode, Docker replicas, or Kubernetes pods), each worker maintains an independent database copy. Writes on Worker A are invisible to Worker B. When Worker B saves to disk, it executes `fs.writeFileSync('./data/payroll.sqlite', Buffer.from(db.export()))`, destroying Worker A's writes.
- **Recommended Action:** Replace `sql.js` with client-server PostgreSQL or standard multi-process `better-sqlite3` with WAL mode enabled.

---

## 2. [RISK-OPS-01] Orphaned Documents & File Leakage on Employee Deletion
- **Severity:** 🟡 **MEDIUM OPERATIONAL RISK**
- **Files Involved:**
  - [`mohsin-&-co-payroll-&-attendance/server.ts:L576-582`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/server.ts#L576-L582)
  - [`mohsin-&-co-payroll-&-attendance/src/db/database.ts:L56-124`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/db/database.ts#L56-L124)
- **Description:**  
  When an employee record is deleted via `DELETE /api/employees/:id`, the route executes `DELETE FROM employees WHERE id = ?`. Foreign key cascades are not configured in SQLite, and `fs.rmSync(path.join(DOCUMENTS_DIR, id), { recursive: true, force: true })` is not called. Physical files remain permanently orphaned in `./data/documents/<id>/`.
- **Recommended Action:** Implement directory removal on employee deletion and add `ON DELETE CASCADE` to SQLite table definitions.

---

## 3. [RISK-SEC-01] Committed Production JWT Secret in Source Control
- **Severity:** 🟡 **MEDIUM SECURITY RISK (CWE-798)**
- **Files Involved:** [`mohsin-&-co-payroll-&-attendance/.env:L4`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/.env#L4)
- **Description:**  
  `JWT_SECRET=8f4k2m9n3p7q5r1t6w8y0u2i4o6p8a9s` is checked into `.env` within the repository root. Anyone with access to the codebase can forge administrator JWTs.
- **Recommended Action:** Remove `.env` from git tracking, add to `.gitignore`, and enforce runtime generation or environment injection.

---

## 4. [RISK-PERF-01] Non-Atomic SQLite Database Exports Under Disk Stress
- **Severity:** 🟡 **MEDIUM RELIABILITY RISK**
- **Files Involved:** [`mohsin-&-co-payroll-&-attendance/src/db/database.ts:L41`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/mohsin-&-co-payroll-&-attendance/src/db/database.ts#L41)
- **Description:**  
  `fs.writeFileSync(DB_PATH, buffer)` writes synchronously over the active database file. Sudden process termination, power loss, or out-of-disk conditions during execution will corrupt the SQLite binary.
- **Recommended Action:** Write to a temporary file first (e.g. `payroll.sqlite.tmp`) and rename atomically using `fs.renameSync`.
