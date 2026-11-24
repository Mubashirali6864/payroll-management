# Mohsin & Co Payroll & Attendance Management System
## System Architecture, Business Rules & Persistent Memory

This document is the persistent single source of truth for the application architecture, business calculations, database schemas, and UX requirements. For detailed functional user stories and requirements, refer to the Product Requirements Document: [PRD.md](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/PRD.md).

---

### 1. Key Business Rules & Formulas

#### A. Payroll Calculation & Payout
- **Employment Models**:
  - `monthly_salary`: Fixed monthly compensation prorated by calendar days in month (`perDayRate = Math.round(base_salary / daysInMonth)`).
  - `daily_wage`: Paid per worked day on a "Daily Come, Daily Pay" basis (`base_salary` is per-day rate).
- **Payable Days & Integer Daily Rate Rounding**:
  - Monthly Salary: `payableDays = daysPresent + (0.5 * halfDays) + daysOff + daysLeave`.
  - Daily Wage: `payableDays = daysPresent + (0.5 * halfDays)`.
  - **Integer Daily Rate Rounding**: `perDayRate = Math.round(base_salary / daysInMonth)` (e.g., `30000 / 31 = 968`).
  - **Absence Deductions**: `absentDeductions = Math.round(perDayRate * daysAbsent)` (e.g., `968 * 2 = 1936`, never fractional 1935.48).
- **Day-Wise Payout During In-Progress Months**:
  - Earned Salary: `earnedSalary = Math.round(payableDays * perDayRate)`.
  - Gross Earnings: `grossEarnings = Math.min(base_salary, earnedSalary + absentDeductions)`.
  - Net Payout: `netPayout = Math.max(0, earnedSalary + totalBonuses - totalFines - advanceDeductions)`.
  - Full Month Completed: `grossEarnings = base_salary; netPayout = grossEarnings - absentDeductions + bonuses - fines - advances`.
- **Daily Wage Settlement Model ("Daily Come, Daily Pay")**:
  - Individual daily wage payslips/vouchers show **Today's Daily Wage Rate** (e.g. PKR 1,000 for 1 day) for cash hand-over, rather than an accumulated 25-day monthly total.
  - In monthly reports, daily wage earnings are tracked for expense accounting: `Cumulative Earned = Days Worked × Daily Rate`, `Already Paid Daily = Cumulative Earned`, `Month-End Pending Payout Due = PKR 0`.
  - **Month-End Payout Isolation & 4-Card Accounting Equation**:
    - Daily wage employees render `PKR 0` in the `NET PAYOUT` column with badge: `Cleared Daily (PKR 25,000 Paid)`.
    - **Card 1: `Total Gross`**: `PKR 50,168` (Monthly staff PKR 25,168 + Daily wage PKR 25,000).
    - **Card 2: `Absent & Cuts`**: `- PKR 1,936` (Monthly staff deductions).
    - **Card 3: `Daily Cash Paid`**: `- PKR 25,000` (Cash disbursed upon shift completion).
    - **Card 4: `Net Month-End Payout`**: `PKR 23,232` (Bank transfer liability for monthly staff).
    - **Accounting Equation**: $50,168 - 1,936 - 25,000 = 23,232 \checkmark$.

#### B. Accurate Accrual Cost Calculation (Today & Month-To-Date)
- **Elimination of Arbitrary `/ 26` Division**:
  - Daily accrual rate for monthly staff is strictly `base_salary / daysInMonth` (where `daysInMonth` is the exact calendar month length).
- **Attendance-Driven Accrual**:
  - Daily wage staff: Earn `base_salary` when present/late, `0.5 * base_salary` when half-day, `0` when absent/off/leave.
  - Monthly salary staff: Earn `perDayRate` when present/late/leave/scheduled off day, `0.5 * perDayRate` when half-day, and `0` when absent (because an absence deduction is applied to their paycheck).
  - Unrecorded working days count as absent $\rightarrow$ accrual is Rs. 0.
- **Month-to-Date (MTD) Cumulative Accrual**:
  - Evaluates exact daily earnings from day 1 of the active calendar month through today, showing total accrued payroll liability.

#### C. Dynamic Monthly Days & Strict User-Selected Off Days
- **Exact Calendar Month Days (30, 31, 28/29)**:
  - Total month days in payroll are calculated dynamically based on the exact calendar month via `new Date(year, month1Indexed, 0).getDate()`.
  - Hardcoded `30` is eliminated across the entire application.
  - Table header displays: `Month Days / Attendance Breakdown` with format `{totalMonthDays}d | {daysPresent}P | {daysAbsent}A | {daysOff}Off | {daysLeave}L`. Tooltip displays scheduled working days.
  - Payslips and modals clearly display total calendar days in month and scheduled working days.
- **No Standard / Default Off Days**:
  - Neither Daily Wage nor Monthly Salary workers receive automatic or forced off days (no standard Friday off, no standard Sunday off).
  - `weekly_off_day` defaults to empty string `''`.
  - Database schema and migrations default `weekly_off_day` to `''` and neutralize legacy forced `'0'`.
- **Strict User-Selected Off Days**:
  - ONLY if the admin explicitly configures/selects recurring weekly off days (via the multi-toggle Sun-Sat selector in Employee Management) or specific calendar dates (`custom_off_dates`) are off days assigned.
  - If no weekly off day or custom off date is selected, the employee has strictly 0 off days and working days equal their full tenure calendar days (e.g. 30 or 31).
- **Explicit Absent Preservation**:
  - When HR or a supervisor explicitly enters an attendance record with `status = 'absent'`, or when a biometric punch is recorded as absent, that count is definitive.
  - `daysAbsent` is guaranteed to be at least `attRecords.filter(a => a.status === 'absent').length`.
  - Calendar inference math never reduces explicit absences.

#### C. Employee Lifecycle & Data Integrity
- **Soft Deletion Gate**:
  Employees with historical attendance records or finalized (approved/paid) payroll records are never hard-deleted. They are marked `status = 'inactive'` with `exit_date` and `exit_reason`.
- **Reactivation Security Gate**:
  Reactivating an inactive/resigned employee requires super-admin authentication with password verification (`/api/employees/:id/reactivate`).

---

### 2. Database Schema (SQLite via `sql.js`)

- **`employees`**: `id`, `employee_code`, `name`, `email`, `department`, `designation`, `employment_type`, `base_salary`, `joining_date`, `exit_date`, `exit_reason`, `status`, `weekly_off_day`, `custom_off_dates`, `shift_id`
- **`attendance`**: `id`, `employee_id`, `date`, `check_in_time`, `check_out_time`, `status`, `hours_worked`, `late_minutes`, `is_manual_override`, `override_reason`, `override_by`, `device_id`
- **`payroll`**: `id`, `employee_id`, `period_month`, `base_rate`, `working_days`, `days_present`, `days_absent`, `days_late`, `days_leave`, `days_off`, `gross_earnings`, `absent_deductions`, `total_bonuses`, `total_fines`, `advance_deductions`, `net_payout`, `status`, `generated_at`
- **`payroll_adjustments`**: `id`, `payroll_id`, `employee_id`, `type`, `amount`, `description`, `created_at`
- **`shifts`**: `id`, `name`, `start_time`, `end_time`, `grace_period_mins`, `half_day_hours`, `full_day_hours`

---

### 3. Frontend Views & UI Components

- **Universal Table Serial Numbering (`#` Column)**:
  - Standardized `#` serial numbering (`1, 2, 3...`) as the first column across all views: `EmployeeManagementView`, `AttendanceView`, `PayrollView`, `ReportsView`, `DashboardView`.
  - Removed duplicate numbering embedded inside employee names.

- **`PayrollView.tsx`**:
  - Column: `Month Days / Attendance Breakdown` (`{totalMonthDays}d | {days_present}P | {days_absent}A | {days_off}Off | {days_leave}L`) for monthly staff.
  - Column: `Working Hours` (`{totalHours} hrs`) for daily wage workers.
  - Monthly recalibration, status badges (Draft / Approved / Paid).
  - **Daily Wage Consolidated Bulk Payslip Sheet**:
    - Dedicated single landscape printable sheet displaying all daily wage workers in a consolidated table (`#`, Code, Name, Designation, Daily Rate, Total Hours Worked, Gross, Adjustments, Net Payout, Signature).
    - Eliminates the need to print individual pages for daily wage staff.
  - **Half-A4 / A5 Monthly Payslip Specification & Inter Typography**:
    - Typography: **Inter** Google Font across UI, payslips, registers, and PDF generation.
    - Official Physical Dimensions: `148mm × 210mm` (5.83 × 8.27 in, half of standard A4).
    - Digital Resolutions: 300 DPI Print Quality (`1748 × 2480 px`), 72 DPI Screen Preview (`419 × 595 px`, popup `460 × 650 px`).
    - Print Margins: `@page { size: 148mm 210mm; margin: 5mm 6mm; }` with `.a5-container { max-width: 148mm; }`.
    - Minimalist Wording: Description, Amount, Salary Payslip, Net Pay.
    - Employee Identity Badge & Business Signatures.
    - Modal Dialog proportioned to `max-w-lg`.

- **`DashboardView.tsx`**:
  - **Dual KPI Breakdown & Model Redirection**:
    - Daily Wage Staff card (`#d97706` amber): Clicking immediately navigates to HR Management with the **Daily Wage** filter active (`onNavigateTab('employees', 'daily_wage')`).
    - Monthly Salary Staff card (`#1ea7fd` cyan): Clicking immediately navigates to HR Management with the **Monthly Salary** filter active (`onNavigateTab('employees', 'monthly_salary')`).
  - **Reverse-Chronological Recent Attendance Activity**:
    - Sorts records so that employees with active punches appear at the top, ordered with the latest check-in time first.
    - Removed arbitrary `09:00 AM` fallback; unrecorded records show `--:--` in muted italics.
    - Segmented filter buttons: `Checked In (X)` for rapid verification and `All (Y)` for the complete roster.

- **`ReportsView.tsx`**:
  - Dual KPI Cards: `Daily Wage Payout Estimate` and `Monthly Staff Payout Estimate`.
  - Comprehensive summary table with `#` column, clean working hours vs days breakdown, and a structured table footer (`<tfoot>`) with column totals.
  - Printable/Downloadable PDF summary embedding both estimates.

- **`EmployeeDetailModal.tsx`**:
  - Monthly Staff: `DAYS PRESENT & OFFS` displaying `{daysPresent} Days (+{daysOff} Off)` with `{payableDays} Total Payable Days`.
  - Daily Wage Staff: `TOTAL WORKING HOURS` displaying `{totalHours} hrs`.
  - Comprehensive attendance log tab, payslip breakdown, biometric history.

- **`Sidebar.tsx`**:
  - Smooth width transition (`w-60` $\leftrightarrow$ `w-[72px]`) using `transition-[width] duration-300 ease-in-out`.
  - Zero-shift icon alignment: Constant `px-3` sidebar padding and fixed `w-6 h-6` icon slots guarantee menu icons and the user avatar remain locked at the exact same horizontal coordinate in both states.
  - Text labels fade and slide smoothly without wrapping or popping (`opacity-0 max-w-0 -translate-x-1`).
  - Floating tooltips on hover in collapsed mode.

- **`EmployeeManagementView.tsx`**:
  - **Active Compensation Model Filter Buttons**:
    - Prominent top-row segmented buttons: `All ({total})`, `Monthly ({monthlyCount})`, and `Daily Wage ({dailyCount})`.
    - Clicking `Monthly` shows only monthly salary staff; clicking `Daily Wage` shows only daily wage staff; clicking `All` restores the full roster.
    - Active state styling: Selected button is highlighted with solid background, white text, and shadow.
    - Full two-way synchronization with the secondary filter dropdown and Dashboard card navigation.
  - Employee directory with `#` serial numbering, active/inactive filtering, quick profile view, edit modal, soft-delete, and password-protected reactivation modal.

---

### 4. Agent Protocols & Knowledge Graph (Graphify & AGENTS.md)

- **Root Protocol**: Defined in [AGENTS.md](file:///e:/Softwares/Payroll%20Management%20-%20Copy/AGENTS.md).
- **Knowledge Graph**: Located in `graphify-out/` (1,139+ nodes, 1,541+ edges, 83 communities).
- **Architecture Fast Path**:
  - Agents must run `.\graphify.cmd query "<concept>"` or query `graphify-out/graph.json` before performing raw regex or multi-file scans.
  - After modifying codebase files, run `.\graphify.cmd update .` to keep AST call-graphs synchronized.
- **Architecture Visuals**: Documented in `docs/architecture.html` and `docs/payroll-lifecycle.html` generated via `archify`.

---

### 5. Verification & Testing

- Build command: `node build.js` (runs `tsc --noEmit` followed by Vite frontend bundle and esbuild backend).
- Dev server: `npm run dev` running on `http://localhost:3000`.
- Deep QA Audit: `node --test tests/comprehensive_deep_qa_audit.mjs` (20/20 test suites).
- User Requests Verification: `node --test tests/user_requests_verification.mjs` (6/6 test suites).
- Regression Suites: `node --test tests/p1_regression.mjs tests/p2_regression.mjs` (11/11 test suites).
- Zero tolerance for undeclared variables or TypeScript compiler warnings.

