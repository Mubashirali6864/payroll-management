# Mohsin & Co Payroll & Attendance Management System - Constitution & Permanent Memory

## Core Principles & System Architecture

### I. Accurate Attendance & Explicit Absence Preservation (NON-NEGOTIABLE)
- **Authoritative Explicit Logs**: Any attendance record with `status === 'absent'` entered by HR/Admin or captured from biometrics is strictly authoritative. Calendar-based inference or elapsed active tenure math MUST NEVER reduce or overwrite explicit absent records. `daysAbsent = Math.max(explicitAbsentDays, computedAbsent)`.
- **Dynamic Monthly Days (30, 31, 28/29)**: Total monthly days in payroll are calculated dynamically based on the exact calendar month via `new Date(year, month1Indexed, 0).getDate()`. Hardcoded `30` is strictly forbidden.
- **No Standard / Default Off Days**: Neither Daily Wage nor Monthly Salary workers receive automatic or forced off days (no default Friday off, no default Sunday off). `weekly_off_day` defaults to empty string `''`.
- **Strict User-Selected Off Days**: ONLY if the user explicitly configures/selects recurring weekly off days (via the multi-toggle Sun-Sat selector in Employee Management) or specific calendar dates (`custom_off_dates`) are off days assigned. If unselected, off days are strictly 0 and scheduled working days equal full calendar days in tenure.
- **Payable Days & Integer Daily Rate Rounding**:
  - For Monthly Salary employees: `payableDays = daysPresent + (0.5 * halfDays) + daysOff + daysLeave`.
  - For Daily Wage workers: `payableDays = daysPresent + (0.5 * halfDays)`.
  - **Integer Daily Rate Rounding**: Daily rate is strictly rounded to nearest integer: `perDayRate = Math.round(base_salary / daysInMonth)` (e.g. `30000 / 31 = 968`).
  - **Absence Deduction Formula**: Absent deduction is evaluated as `Math.round(perDayRate * daysAbsent)` (e.g. `968 * 2 = 1936`, never fractional 1935.48).
- **Day-Wise Proration Logic**:
  - During mid-month / in-progress payroll periods, earned salary reflects elapsed days worked and off days: `earnedSalary = Math.round(payableDays * perDayRate)`.
  - Payout: `netPayout = Math.max(0, earnedSalary + totalBonuses - totalFines - advanceDeductions)`.
  - Deductions: `absentDeductions = Math.round(perDayRate * daysAbsent)`.
  - Gross earnings: `grossEarnings = Math.min(base_salary, earnedSalary + absentDeductions)`.

### II. Employee Lifecycle, Soft-Deletion & Reactivation Security
- **Cascade Deletion Protection (P-02 Rule)**: Any employee with attendance logs or approved/paid payroll records CANNOT be permanently hard-deleted. They must be soft-deleted by setting `status = 'inactive'` and recording `exit_date` and `exit_reason`.
- **Admin Password Gate for Reactivation**: Deactivated or resigned employees can ONLY be reactivated by a user with the `super_admin` role after verifying their administrative password (`/api/employees/:id/reactivate` verifies password against database hash).

### III. Shift Policies & Work Hours Architecture
- Standard shift timings, grace periods, half-day thresholds, and overtime calculations are strictly applied.
- The Shift Policies modal supports creating, editing, and assigning custom shifts.

### IV. UI/UX Clarity, A5 Standards & Inter Typography
- **Typography Standard**: The universal typography standard is **Inter** (`font-family: 'Inter', system-ui, -apple-system, sans-serif`), loaded via Google Fonts and applied across the web UI, print popups, modals, tables, and exported PDFs.
- **A5 Paper Standard (Half-A4)**:
  - Official physical dimensions: `148mm × 210mm` (5.83 × 8.27 in).
  - Print resolution (300 DPI): `1748 × 2480 px`.
  - Screen resolution (72 DPI): `419 × 595 px` (print preview popup styled to `460 × 650 px`).
  - Margin standard: `@page { size: 148mm 210mm; margin: 5mm 6mm; }` with `.a5-container { max-width: 148mm; }`.
- **Payroll Table**: Column header is `Month Days / Attendance Breakdown` displaying `{totalMonthDays}d | {r.days_present}P | {r.days_absent}A | {r.days_off}Off | {r.days_leave}L` for monthly staff, and `Working Hours` (`{totalHours} hrs`) for daily wage workers.
- **Universal Table Serial Numbering (# Column)**: Every data table across all application views (`EmployeeManagementView`, `AttendanceView`, `PayrollView`, `ReportsView`, `DashboardView`) MUST feature an independent serial number `#` column (`1, 2, 3...`) as its first column. Redundant number prefixes embedded in employee names (e.g. `1. Deep QA`) are strictly removed.
- **Employee Detail Modal**: Card 1 header is `DAYS PRESENT & OFFS` with `{daysOff} Off` badge, main value `{daysPresent} Days (+{daysOff} Off)`, and subtitle `{payableDays} Total Payable Days ({daysPresent} Present + {daysOff} Off)`. For daily wage workers, display `TOTAL HOURS WORKED`.
- **HR Management Active Model Buttons & Bidirectional Dashboard Redirection**:
  - `EmployeeManagementView` features a prominent segmented active toggle in the header: `All ({total})`, `Monthly ({monthlyCount})`, and `Daily Wage ({dailyCount})`.
  - The currently selected model is visibly highlighted as active (solid background, contrasting text, elevation shadow).
  - Clicking `Monthly` shows only monthly salary staff; clicking `Daily Wage` shows only daily wage staff; clicking `All` restores all employees.
  - Clicking the **Daily Wage Staff** card on the Dashboard redirects to HR Management with the `Daily Wage` filter pre-selected (`onNavigateTab('employees', 'daily_wage')`).
  - Clicking the **Monthly Staff** card on the Dashboard redirects to HR Management with the `Monthly Salary` filter pre-selected (`onNavigateTab('employees', 'monthly_salary')`).
- **Sidebar Collapse & Smooth Transitions**: The desktop sidebar width transitions smoothly between `w-60` (expanded) and `w-[72px]` (collapsed) with fixed horizontal padding (`px-3`) and dedicated icon slots (`w-6 h-6`). Menu icons and user avatar maintain a locked horizontal coordinate so they never shift or jump position during collapse/expand. Text labels smoothly fade and collapse (`transition-all duration-300 opacity-0 max-w-0`), and floating tooltips display on hover when collapsed.

### V. Daily Wage Management & "Daily Come, Daily Pay" Architecture
- **Daily Settlement Principle**: Daily wage is strictly "Daily Come, Daily Pay" (cash handed over upon completion of daily shift).
- **Daily Wage Payslip / Voucher**:
  - Individual daily wage payslips represent a single-day cash payout slip or shift voucher showing **Today's Daily Wage Rate** (e.g. PKR 1,000 for 1 day worked) rather than an accumulated 25-day monthly total.
  - Workers receive their cash on the day worked; displaying a monthly accumulated total (e.g. PKR 25,000) on a daily slip is forbidden as it creates cash double-payment risk.
- **Monthly Audit Ledger Integration & Payout Isolation**:
  - In monthly payroll reports and registers, daily wage attendance is tracked for accounting and tax/P&L records:
    `Cumulative Value = Days Worked × Daily Rate` (e.g. 25 × 1,000 = PKR 25,000),
    `Already Disbursed Daily = PKR 25,000`,
    `Month-End Pending Payout Due = PKR 0`.
  - In the Monthly Register table, daily wage workers render `PKR 0` in the `NET PAYOUT` column with status badge `Cleared Daily (PKR 25,000 Paid)`.
  - Summary Card 3 (`NET MONTH-END PAYOUT`) strictly sums monthly staff bank transfers (`PKR 23,232`), completely isolating daily wage cash to prevent double-payment bank withdrawals.
  - Summary Card 1 is explicitly labeled `TOTAL GROSS EARNINGS` reflecting total earned wages across all staff models.
- **Consolidated Single-Sheet Landscape Table**: Daily wage staff payroll registers can also be viewed and printed in bulk on a single unified sheet rather than individual pages. The printable sheet contains employee code, full name, designation, daily rate, total hours worked, gross earnings, adjustments, and final net payout with formal approval signatures.
- **Dynamic Grammar Standards**: All user-facing documents, buttons, and summary tags strictly employ dynamic pluralization (e.g., `Daily Wage Sheet (1 Row)` when 1 worker is present vs `(X Rows)`).
- **Hours-Driven Accountability**: Daily wage workers are compensated based on hours worked (`total_hours_worked`) and shifts delivered rather than calendar day metrics. Attendance views and payslips display hours worked without irrelevant present/absent counts.

### VI. Dashboard & Reporting Metrics Architecture
- **Dual Employee Category KPI Cards**: The dashboard clearly distinguishes between Daily Wage and Monthly Salary obligations:
  - Daily Wage Staff card displays active daily worker count and total daily rate baseline (`Rs. X / day`).
  - Monthly Salary Staff card displays active monthly staff count and total monthly salary baseline (`Rs. Y / month`).
- **Reverse-Chronological Attendance Activity**: The dashboard Recent Attendance table displays employees with recorded punches at the top, ordered with the most recent punches first (descending check-in time). Fake check-in fallbacks (e.g. `09:00 AM`) are strictly prohibited; unrecorded rows show `--:--` in muted italics. Segmented filter pills (`Checked In` vs `All`) allow instantaneous verification of checked-in staff.
- **Reports View Estimations & Totals**: The Reports view provides explicit KPI cards for Daily Wage Payout Estimate and Monthly Staff Payout Estimate alongside a consolidated table footer (`<tfoot>`) and exportable PDF summary.

### VII. Zero-Defect Build & Verification Gate (STRICT)
- **Compiler Gate**: `build.js` runs `node ./node_modules/typescript/bin/tsc --noEmit` before bundling. Any undefined variable, broken import, or type mismatch halts the build immediately.
- **Run App After Edits**: The Express + Vite development server runs on `http://localhost:3000` and must be verified and active after modifications.

## Technical Specifications & Storage
- **Backend**: Node.js + Express with `tsx` / `esbuild`.
- **Database**: SQLite (`sql.js`) persisted to `data/payroll.sqlite`.
- **Frontend**: React 19 + TypeScript + TailwindCSS + Lucide Icons.
- **Biometric Sync**: Real-time push / debounce boundary processing with device verification.

**Version**: 2.2.0 | **Ratified**: 2026-09-01 | **Last Amended**: 2026-10-26
