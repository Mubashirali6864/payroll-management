# Mohsin & Co Payroll & Attendance Management System

A robust, enterprise-grade payroll and biometric attendance tracking system built with Node.js, Express, SQLite (`sql.js`), and React 19.

---

## Architecture & System Documentation

- **Product Requirements Document (PRD)**: [`docs/PRD.md`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/PRD.md)
- **System Walkthrough & Expected Behavior**: [`docs/SYSTEM_WALKTHROUGH_AND_EXPECTED_BEHAVIOR.md`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/SYSTEM_WALKTHROUGH_AND_EXPECTED_BEHAVIOR.md)
- **Testing Process & Verification Protocol**: [`docs/TESTING_PROCESS_AND_VERIFICATION_PROTOCOL.md`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/TESTING_PROCESS_AND_VERIFICATION_PROTOCOL.md)
- **Persistent Memory & Constitution**: [`.specify/memory/constitution.md`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/.specify/memory/constitution.md)
- **Architecture & Rules Reference**: [`docs/PAYROLL_ARCHITECTURE_AND_MEMORY.md`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/PAYROLL_ARCHITECTURE_AND_MEMORY.md)
- **Knowledge Graph Report**: [`graphify-out/GRAPH_REPORT.md`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/graphify-out/GRAPH_REPORT.md)
- **Interactive System Architecture**: [`docs/architecture.html`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/architecture.html)
- **Interactive Payroll Lifecycle Workflow**: [`docs/payroll-lifecycle.html`](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/payroll-lifecycle.html)

---

## Core Principles & Business Logic

1. **Explicit Attendance Preservation**:
   - Attendance logs with `status === 'absent'` are authoritative. Calendar-based math never reduces explicit absences (`daysAbsent >= explicitAbsentDays`).
2. **Weekly Off Days & Day-Wise Payout**:
   - Monthly employees receive daily proration: `payableDays = daysPresent + (0.5 * halfDays) + daysOff + daysLeave`.
   - `earnedSalary = Math.round(payableDays * (base_salary / daysInMonth))`.
   - Off-days are stored in `payroll.days_off` and shown across the Payroll table and Employee Detail cards.
3. **Data Integrity & Security**:
   - Soft-delete for employees with attendance or finalized payroll history (`status = 'inactive'`).
   - Reactivating resigned or inactive employees requires super-admin password verification.
4. **Compiler Quality Gate**:
   - `build.js` executes `tsc --noEmit` before any bundle generation.

---

## Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Access the dashboard at [http://localhost:3000](http://localhost:3000).

3. **Build for Production**:
   ```bash
   npm run build
   ```
