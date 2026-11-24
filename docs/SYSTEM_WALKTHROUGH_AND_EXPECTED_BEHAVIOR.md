# Mohsin & Co Payroll & Attendance Management System
## System Walkthrough & Expected Behavior Guide

**Document Version**: 2.2.0  
**Target Audience**: Product Managers, QA Engineers, Operations & HR Personnel, System Administrators  
**Companion Documents**:
- Product Requirements: [PRD.md](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/PRD.md)
- Testing & Verification: [TESTING_PROCESS_AND_VERIFICATION_PROTOCOL.md](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/TESTING_PROCESS_AND_VERIFICATION_PROTOCOL.md)
- System Architecture & Memory: [PAYROLL_ARCHITECTURE_AND_MEMORY.md](file:///e:/Softwares/Payroll%20Management%20-%20Copy/docs/PAYROLL_ARCHITECTURE_AND_MEMORY.md)

---

## 1. System Overview & Navigation Structure

Mohsin & Co Payroll & Attendance Management System is an enterprise platform managing hybrid workforces across two compensation tracks:
1. **Monthly Contractual Staff**: Prorated monthly salary with strict attendance and absence deductions.
2. **Daily Wage Workers (*Dihari*)**: "Daily Come, Daily Pay" cash disbursement model.

### Primary Navigation (Sidebar)
The collapsible sidebar transitions smoothly between expanded (`w-60`) and compact (`w-[72px]`) modes without icon displacement (`transition-[width] duration-300`). It provides access to:
1. **Dashboard** (`DashboardView`): Operational metrics, category headcounts, and live attendance muster roll.
2. **Employees / HR Management** (`EmployeeManagementView`): Staff roster, employment classification, shift assignment, and lifecycle controls.
3. **Attendance** (`AttendanceView`): Daily muster roll, biometric sync status, and manual supervisor overrides.
4. **Payroll Engine** (`PayrollView`): Compensation calculation, status workflow, adjustments, and batch payslip generation.
5. **Reports** (`ReportsView`): Cost projections, P&L audit tables, and fiscal export summaries.
6. **Settings & Policies**: Shift policies, biometric device pairing, company branding, and audit logs.

---

## 2. Module Walkthroughs & Expected Behaviors

### A. Executive Dashboard (`DashboardView`)

```
+-----------------------------------------------------------------------------------+
|  [ DAILY WAGE WORKERS ]                        [ MONTHLY SALARY STAFF ]           |
|  1 Active Worker                                1 Active Employee                 |
|  Baseline: Rs. 1,000 / day                      Baseline: Rs. 30,000 / month      |
|  -> Click to Filter Daily Wage                  -> Click to Filter Monthly Staff  |
+-----------------------------------------------------------------------------------+
|  RECENT ATTENDANCE ACTIVITY                                                       |
|  [ Checked In (1) ]  [ All (2) ]                                                  |
|  #  Code      Name          Department     Check-In     Check-Out    Status       |
|  1  EMP-1002  Zain Khan     Production     08:58 AM     05:02 PM     Present      |
|  2  EMP-1001  aaaa          Management     --:--        --:--        Absent       |
+-----------------------------------------------------------------------------------+
```

#### Expected Behavior
1. **Interactive KPI Redirection**:
   - Clicking the **Daily Wage Staff** card immediately routes to the Employee Management tab with the `daily_wage` filter active (`onNavigateTab('employees', 'daily_wage')`).
   - Clicking the **Monthly Salary Staff** card immediately routes to the Employee Management tab with the `monthly_salary` filter active (`onNavigateTab('employees', 'monthly_salary')`).
2. **Reverse-Chronological Attendance Activity**:
   - Employees with confirmed biometric/manual punches are displayed at the top, ordered by latest check-in time first.
   - Employees with no punches on the active day display `--:--` in muted italics. Fake fallback times (like 09:00 AM) are strictly prohibited.
   - **Segmented Filter Pills**:
     - `Checked In (X)`: Instantly filters the view to show only employees who have punched in today.
     - `All (Y)`: Restores the full daily roster.

---

### B. Employee Management & HR Directory (`EmployeeManagementView`)

```
+-----------------------------------------------------------------------------------+
|  EMPLOYEES DIRECTORY                                                              |
|  [ All (2) ]  [ Monthly (1) ]  [ Daily Wage (1) ]         [ + Add New Employee ]  |
+-----------------------------------------------------------------------------------+
|  #   Code       Name         Category       Base Salary    Shift      Status      |
|  1   EMP-1001   aaaa         Monthly        PKR 30,000     General    Active      |
|  2   EMP-1002   Zain Khan    Daily Wage     PKR 1,000/day  Standard   Active      |
+-----------------------------------------------------------------------------------+
```

#### Expected Behavior
1. **Universal Serial Numbering (`#`)**:
   - The first column is strictly `#` with sequential integers (`1, 2, 3...`).
   - Duplicate numbering prefixes embedded in names (e.g. `1. aaaa`) are automatically eliminated.
2. **Segmented Model Filter Buttons**:
   - Three prominent top-row buttons: `All ({total})`, `Monthly ({monthlyCount})`, and `Daily Wage ({dailyCount})`.
   - The active model displays with solid fill, white text, and an elevation shadow.
   - **Status-Scoped Counter Badges**: Counters strictly reflect active employees when `statusFilter === 'active'`. Deactivated/resigned employees are excluded from active badge counts.
3. **Weekly Off Days & Dynamic Months**:
   - `weekly_off_day` defaults to empty string `''`. Neither Sundays nor Fridays are forced off by default.
   - Working days equal the full calendar days in the month (e.g. 31 days in October) unless the user explicitly selects recurring off days in the Sun-Sat picker or custom off dates.
4. **Soft-Deletion Gate (P-02 Rule)**:
   - Deleting an employee with existing attendance records or finalized payroll sets `status = 'inactive'` with required fields `exit_date` and `exit_reason`. Hard database deletion is prohibited.
5. **Reactivation Security Gate**:
   - Reactivating an inactive/resigned employee requires the Super Admin role and prompts for super-admin password verification against the bcrypt database hash.

---

### C. Attendance & Shift Tracking (`AttendanceView`)

#### Expected Behavior
1. **Exact Calendar Length**:
   - Attendance month length dynamically matches the exact calendar month (31 days in Jan/Mar/May/Jul/Aug/Oct/Dec, 30 in Apr/Jun/Sep/Nov, 28/29 in Feb).
2. **Explicit Absence Preservation (Non-Negotiable Business Rule)**:
   - If an employee has 2 explicit absent records logged (via biometric absence or manual supervisor override), the payroll engine guarantees:
     $$\text{daysAbsent} \ge 2$$
   - Tenure proration or dynamic calendar inference math MUST NEVER overwrite, discount, or erase explicit absences.
3. **Biometric Debouncing**:
   - Biometric punches within 5 minutes of an existing punch for the same employee are debounced to prevent duplicate attendance logs.

---

### D. Payroll Management & Compensation Engine (`PayrollView`)

```
+---------------------------------------------------------------------------------------------------------+
|  [ TOTAL GROSS ]      [ ABSENT & CUTS ]      [ DAILY CASH PAID ]          [ NET MONTH-END PAYOUT ]      |
|  PKR 50,168           - PKR 1,936            - PKR 25,000                 PKR 23,232                    |
|  Monthly + Daily      Absent cuts & fines    Paid daily on shifts         Bank transfer liability       |
+---------------------------------------------------------------------------------------------------------+
|  PAYROLL REGISTER (OCTOBER 2026)                                                 [ Recalculate Payroll ]|
|  #  Code       Name       Model       Rate       Gross     Deductions  Net Payout                       |
|  1  EMP-1001   aaaa       Monthly     30,000/mo  25,168    -1,936      PKR 23,232                       |
|  2  EMP-1002   Zain Khan  Daily Wage  1,000/day  25,000        0       PKR 0 [Cleared Daily (25k Paid)] |
+---------------------------------------------------------------------------------------------------------+
```

#### Expected Behavior & Mathematical Rules
1. **Mathematically Balanced Accounting Cards (100% Equation Equality)**:
   - **Card 1: `Total Gross`**: Shows **PKR 50,168** (Monthly staff PKR 25,168 + Daily wage PKR 25,000).
   - **Card 2: `Absent & Cuts`**: Shows **- PKR 1,936** (2 absent days $\times$ PKR 968 daily rate for monthly staff).
   - **Card 3: `Daily Cash Paid`**: Shows **- PKR 25,000** (cumulative cash already disbursed upon shift completion).
   - **Card 4: `Net Month-End Payout`**: Shows **PKR 23,232** (strictly the pending month-end bank transfer obligation for monthly staff).
   - **Accounting Proof**:
     $$\mathbf{50,168 - 1,936 - 25,000 = 23,232 \quad \checkmark}$$
   - When filtering by **Monthly Staff**: Switches to a 3-card view ($25,168 - 1,936 = 23,232$).
   - When filtering by **Daily Wage**: Switches to a 3-card view ($25,000 - 25,000 = 0$).
2. **Integer Daily Rate Rounding**:
   - Monthly base of PKR 30,000 in a 31-day month yields:
     $$\text{perDayRate} = \text{Math.round}\left(\frac{30000}{31}\right) = \text{PKR } 968$$
   - Absence deduction for 2 absent days:
     $$\text{absentDeductions} = \text{Math.round}(968 \times 2) = \text{PKR } 1,936 \quad (\text{strictly not } 1,935.48)$$
3. **Daily Wage Worker Display in Register**:
   - Column `NET PAYOUT`: Renders **PKR 0** with a high-visibility badge: `Cleared Daily (PKR 25,000 Paid)`.
   - Employee Code: Rendered with `whitespace-nowrap` so `(EMP-1002)` never splits across multiple lines.
4. **Dynamic Singular/Plural Grammar**:
   - Download button dynamically renders: `Daily Wage Sheet (1 Row)` when 1 daily worker exists, or `Daily Wage Sheet (X Rows)` when multiple exist.

---

### E. Payslip & Batch Sheet Generation

#### 1. Monthly Staff Payslip (A5 Half-A4 Standard)
- **Paper Dimensions**: Exactly Half-A4 / A5 (`148mm × 210mm` / `5.83 × 8.27 in`).
- **Typography**: Universal **Inter** Google Font across headers, tabular figures, and legal signatures.
- **Preview & Modal**: Styled in a proportioned popup (`max-w-lg`, `460 × 650 px`).
- **Print CSS Constraints**:
  ```css
  @page { size: 148mm 210mm; margin: 5mm 6mm; }
  .a5-container { max-width: 148mm; margin: 0 auto; }
  ```
- **Wording Standard**: Minimalist, professional terminology (`Description`, `Amount`, `Salary Payslip`, `Net Pay`, authorized signature blocks).

#### 2. Daily Wage Consolidated Bulk Sheet
- **Format**: Single continuous landscape A4 wage sheet.
- **Content**: Consolidated rows for all daily wage workers (`#`, Code, Name, Designation, Daily Rate, Total Hours Worked, Gross, Net Payout, and Physical Signature Line).
- **Zero Page Waste**: All daily wage workers print on a unified sheet, eliminating individual wasted pages.

---

### F. Reports & Corporate Financial Export (`ReportsView`)

#### Expected Behavior
1. **Dual Payout Projections**:
   - Top KPI cards explicitly separate `Daily Wage Payout Estimate` from `Monthly Staff Payout Estimate`.
2. **P&L Integrity**:
   - Table displays full serial numbering `#`, working hours vs days breakdown, and a structured `<tfoot>` summarizing total gross wages, deductions, and disbursements.
3. **Export Formats**:
   - Printable PDF and Excel export maintain integer arithmetic consistency with on-screen figures.
