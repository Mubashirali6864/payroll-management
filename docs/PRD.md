# Mohsin & Co Payroll & Attendance Management System
## Product Requirements Document (PRD)

**Document Version**: 2.2.0  
**Status**: Approved & Implemented  
**Target Environment**: Desktop Web / Internal Network Deployment  
**Document Owner**: Mohsin & Co Engineering Team  

---

## 1. Executive Summary & Product Vision

Mohsin & Co Payroll & Attendance Management System is a specialized, high-reliability enterprise human resource, biometric attendance, and compensation software. The system provides an end-to-end operational platform that bridges physical hardware biometric data with financial accounting, automated wage calculations, and paper-accurate payslip generation.

The software is engineered specifically for hybrid employment environments that simultaneously operate:
1. **Contractual Monthly Salary Staff**: Compensated on a monthly schedule with prorated deductions for unauthorized absences, partial days, and custom shift schedules.
2. **Daily Wage Workers (*Dihari*)**: Compensated under a strict **"Daily Come, Daily Pay"** operational protocol where wages are disbursed in cash at the end of each daily shift, preventing month-end double-disbursement while maintaining an audit trail for company P&L.

---

## 2. User Roles & Permission Matrix

| Role | Access Scope | Key Capabilities |
| :--- | :--- | :--- |
| **Super Admin** | Full System Ownership | Manage company settings, recalculate/approve/pay/unlock payroll, force-delete drafts, reactivate resigned staff with password verification, configure biometric devices. |
| **HR Manager (`manager`)** | Workforce & Attendance | Add/edit employees, configure weekly and custom off-days, assign shifts, manage daily attendance overrides, add payroll bonuses/fines/advances, transition payroll from `draft` to `approved`. |
| **Cashier / Accountant (`cashier`)** | Disbursement & Records | View attendance & approved payroll, record advance recovery/cash adjustments, mark payroll as `paid`, print daily wage consolidated sheets and individual monthly payslips. Cannot edit base contracts or override shifts. |
| **Viewer / Supervisor** | Read-Only Operations | View attendance logs, search employee roster, view summary metrics without mutation capabilities. |

---

## 3. Core Functional Requirements & System Modules

### Module 1: Employee Directory & Lifecycle Management (`EmployeeManagementView`)
- **REQ-1.1 Universal Serial Numbering (`#`)**: All tables MUST feature an independent serial number `#` column (`1, 2, 3...`) as the first column. Redundant number prefixes in employee names are strictly purged.
- **REQ-1.2 Dual Employment Models**: Explicit categorization into `monthly_salary` or `daily_wage`.
- **REQ-1.3 Segmented Model Filtering**:
  - Prominent top-row segmented buttons: `All ({total})`, `Monthly ({monthlyCount})`, and `Daily Wage ({dailyCount})`.
  - Active button rendered with solid contrasting background and elevation shadow.
  - Counters are dynamically scoped to the currently active status filter (`active` vs `inactive`), excluding terminated records from active headcounts.
- **REQ-1.4 Two-Way Dashboard Navigation Synchronization**: When navigated from the Dashboard KPI cards, the employee directory automatically switches its active filter to the target model (`daily_wage` or `monthly_salary`).
- **REQ-1.5 Soft Deletion (P-02 Data Integrity Gate)**:
  - Permanent hard-deletion is blocked if an employee has historical attendance or finalized payroll records.
  - Terminated employees are marked `inactive` with required fields `exit_date` and `exit_reason`.
- **REQ-1.6 Super Admin Password-Gated Reactivation**: Reactivating an inactive/resigned employee requires super-admin password verification via `POST /api/employees/:id/reactivate`.
- **REQ-1.7 Explicit Weekly & Custom Off-Days**:
  - `weekly_off_day` defaults to empty string `''` (no forced default Sunday or Friday off).
  - Off days apply ONLY when explicitly configured by HR via the multi-toggle Sun-Sat selector or custom calendar date list (`custom_off_dates`).

---

### Module 2: Attendance Tracking & Shift Engine (`AttendanceView`)
- **REQ-2.1 Exact Calendar Month Computation**:
  - Calendar length is calculated dynamically via `new Date(year, monthIndex, 0).getDate()` (31, 30, 28/29).
  - Hardcoded `30` or arbitrary `/ 26` division is strictly prohibited.
- **REQ-2.2 Explicit Absence Preservation (Non-Negotiable)**:
  - Any attendance record marked `absent` by HR manual override or captured from biometrics is authoritative.
  - Dynamic calendar proration math MUST NEVER reduce or overwrite explicit absences:  
    $$\text{daysAbsent} \ge \text{count}(\text{explicit absent logs})$$
- **REQ-2.3 Biometric Debouncing**: Rapid repeated punches within 5 minutes on the same device/employee are automatically debounced to prevent duplicate attendance logs.
- **REQ-2.4 Shift Compliance & Overtime**:
  - Configurable grace period, half-day hour threshold, and standard full-day hours.
  - Automatic synthesis of daily roster records across all active employees.

---

### Module 3: Payroll Engine & Compensation Calculations (`PayrollView`)

#### Financial Formulas
1. **Integer Daily Rate Rounding**:
   $$\text{perDayRate} = \text{Math.round}\left(\frac{\text{base\_salary}}{\text{daysInMonth}}\right)$$
   *(e.g., PKR 30,000 / 31 = PKR 968)*
2. **Absence Deductions (Integer Arithmetic)**:
   $$\text{absentDeductions} = \text{Math.round}(\text{perDayRate} \times \text{daysAbsent})$$
   *(e.g., PKR 968 × 2 = PKR 1,936, strictly eliminating fractional discrepancies like 1,935.48)*
3. **Payable Days**:
   - Monthly Salary: $\text{payableDays} = \text{daysPresent} + (0.5 \times \text{halfDays}) + \text{daysOff} + \text{daysLeave}$
   - Daily Wage: $\text{payableDays} = \text{daysPresent} + (0.5 \times \text{halfDays})$
4. **Mid-Month In-Progress Proration**:
   - $\text{earnedSalary} = \text{Math.round}(\text{payableDays} \times \text{perDayRate})$
   - $\text{grossEarnings} = \text{Math.min}(\text{base\_salary}, \text{earnedSalary} + \text{absentDeductions})$
   - $\text{netPayout} = \max(0, \text{earnedSalary} + \text{bonuses} - \text{fines} - \text{advances})$
5. **Full Month Completed**:
   - $\text{grossEarnings} = \text{base\_salary}$
   - $\text{netPayout} = \text{grossEarnings} - \text{absentDeductions} + \text{bonuses} - \text{fines} - \text{advances}$

#### Daily Wage "Daily Come, Daily Pay" Financial Model
- **Core Principle**: Daily wage staff are compensated daily in cash upon shift completion.
- **Month-End Pending Payout Isolation**:
  - In monthly payroll registers, daily wage workers have:
    $$\text{Gross Earned} = \text{Days Worked} \times \text{Daily Wage Rate}$$
    $$\text{Already Cleared Daily in Cash} = \text{Gross Earned}$$
    $$\textbf{Month-End Pending Payout Due} = \textbf{PKR 0}$$
  - The `NET PAYOUT` column renders **PKR 0** with a status badge: `Cleared Daily (PKR 25,000 Paid)`.
  - Top summary cards:
    - **Card 1 (`TOTAL GROSS EARNINGS`)**: Displays total period gross earnings across monthly and daily wage staff (e.g., PKR 50,168).
    - **Card 2 (`TOTAL DEDUCTIONS & CUTS`)**: Displays sum of monthly staff absent cuts, fines, and advance recoveries (e.g., - PKR 1,936).
    - **Card 3 (`NET MONTH-END PAYOUT`)**: Strictly displays **month-end bank transfer liabilities** for monthly salary staff (e.g., PKR 23,232), completely isolating daily wage cash to prevent double-payment bank withdrawals.

---

### Module 4: Payslip & Document Generation Engine

#### Monthly Staff Payslip (A5 Half-A4 Standard)
- **Official Physical Dimensions**: `148mm × 210mm` (5.83 × 8.27 in).
- **Resolution Standard**:
  - 300 DPI Print Quality: `1748 × 2480 px`
  - 72 DPI Screen Preview: `419 × 595 px` (styled in a proportioned popup)
- **Print Margins & Stylesheet**:
  ```css
  @page { size: 148mm 210mm; margin: 5mm 6mm; }
  .a5-container { max-width: 148mm; margin: 0 auto; }
  ```
- **Typography**: Universal **Inter** Google Font across all titles, tabular amounts, and notes.
- **Minimalist Wording**: Compact layout with Description, Amount, Net Pay, Company Watermark/Logo, and dual authorized signatures.

#### Daily Wage Consolidated Bulk Sheet
- **Layout**: Single continuous landscape A4 wage sheet grouping all daily wage workers into a unified table (`#`, Code, Name, Designation, Daily Rate, Total Hours Worked, Gross Earnings, Adjustments, Net Payout, and Physical Signature Line).
- **Elimination of Multi-Page Slop**: Eliminates unnecessary individual pages for daily wage staff.
- **Dynamic Grammar**: Download button and summaries display singular/plural terms accurately: `Daily Wage Sheet (1 Row)` vs `Daily Wage Sheet (X Rows)`.

---

### Module 5: Executive Dashboard & Analytics (`DashboardView`)
- **Dual KPI Architecture**:
  - Daily Wage Staff Card: Displays active daily workers and daily rate baseline (`Rs. X / day`). Clicking routes directly to Employee Management with the Daily Wage filter enabled.
  - Monthly Salary Staff Card: Displays active monthly staff and monthly contractual commitment (`Rs. Y / month`). Clicking routes directly to Employee Management with the Monthly Salary filter enabled.
- **Reverse-Chronological Attendance Activity**:
  - Employees with recorded check-in punches are sorted to the top in descending order of check-in time.
  - Arbitrary fallback times (such as fake 09:00 AM check-ins) are strictly forbidden; unpunched rows show `--:--` in muted italics.
  - Segmented toggle pills: `Checked In (X)` for rapid muster-roll audits and `All (Y)` for the complete roster.

---

### Module 6: Corporate Reports & Financial Exports (`ReportsView`)
- **Dual Projections**: Separate KPI metrics for `Daily Wage Payout Estimate` and `Monthly Staff Payout Estimate`.
- **Consolidated Audit Table**: Universal `#` column, hours vs days breakdown, and structured summary table footer (`<tfoot>`) with column totals.
- **Export Formats**: Standardized PDF generation and Excel export with matching integer rounding.

---

## 4. Non-Functional & Technical Requirements

| Dimension | Specification | Verification Gate |
| :--- | :--- | :--- |
| **Language & Typing** | TypeScript 5.x throughout frontend and backend | `node ./node_modules/typescript/bin/tsc --noEmit` must pass with 0 errors. |
| **Code Quality & Testing** | Comprehensive automated test coverage (unit, integration, regression) | `node --test tests/comprehensive_deep_qa_audit.mjs` must pass 20/20 test suites. |
| **Knowledge Graph Synchronization** | AST-level knowledge graph maintaining symbol relationships | `.\graphify.cmd update .` executed after any TS/JS modification. |
| **UI Aesthetics & Responsiveness** | TailwindCSS + Inter Typography, smooth sidebar transition (`transition-[width] duration-300`), zero-jump icon alignment | Visual verification via Playwright and browser subagent. |
| **Persistence & Database** | SQLite via `sql.js` in `data/payroll.sqlite` with write-through snapshotting | Zero data loss on server restarts. |
| **Server Liveness** | Express + Vite development server running on `http://localhost:3000` | Healthcheck and API ping confirmation. |

---

## 5. Architectural Memory & Changelog

### v2.2.0 (Current)
- **Resolved Daily Wage Month-End Double Payout Vulnerability**:
  - Daily wage net payout in monthly register now displays `PKR 0` (`Cleared Daily (PKR 25,000 Paid)`).
  - Summary Card 3 (`NET MONTH-END PAYOUT`) strictly sums monthly staff bank transfers (`PKR 23,232`).
- **Corrected Top Summary Card Terminology**:
  - Card 1 re-labeled from `TOTAL GROSS BASE` to `TOTAL GROSS EARNINGS` (`PKR 50,168`).
- **Dynamic Grammar & Pluralization**:
  - Dynamic button labeling: `Daily Wage Sheet (1 Row)` vs `(X Rows)`.
- **Scoped Model Filter Counts**:
  - Counter badges on `EmployeeManagementView` model filter buttons now strictly count active employees matching the current status filter.
- **Bidirectional Navigation**:
  - Full two-way synchronization between Dashboard KPI cards and HR Management segmented filters.
