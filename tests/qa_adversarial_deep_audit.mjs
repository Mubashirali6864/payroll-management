import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from '../mohsin-&-co-payroll-&-attendance/node_modules/sql.js/dist/sql-wasm.js';

// Helper to initialize an in-memory database matching the application schema
async function setupTestDb() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      check_in_time TEXT NOT NULL,
      check_out_time TEXT NOT NULL,
      grace_period_minutes INTEGER NOT NULL,
      mark_absent_after_grace INTEGER NOT NULL DEFAULT 1,
      work_days TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      employee_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      cnic TEXT NOT NULL,
      photo_url TEXT,
      department TEXT NOT NULL,
      designation TEXT NOT NULL,
      joining_date TEXT NOT NULL,
      employment_type TEXT NOT NULL,
      base_salary REAL NOT NULL,
      weekly_off_day TEXT NOT NULL DEFAULT '0',
      custom_off_dates TEXT DEFAULT '',
      shift_id TEXT NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      status TEXT NOT NULL,
      hours_worked REAL DEFAULT 0,
      late_minutes INTEGER DEFAULT 0,
      is_manual_override INTEGER DEFAULT 0,
      override_reason TEXT,
      override_by TEXT,
      device_id TEXT,
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      period_month TEXT NOT NULL,
      base_rate REAL NOT NULL,
      working_days INTEGER NOT NULL,
      days_present INTEGER NOT NULL,
      days_absent INTEGER NOT NULL,
      days_late INTEGER NOT NULL,
      days_leave INTEGER DEFAULT 0,
      gross_earnings REAL NOT NULL,
      absent_deductions REAL NOT NULL,
      total_bonuses REAL DEFAULT 0,
      total_fines REAL DEFAULT 0,
      advance_deductions REAL DEFAULT 0,
      net_payout REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TEXT NOT NULL,
      UNIQUE(employee_id, period_month)
    );

    CREATE TABLE IF NOT EXISTS payroll_adjustments (
      id TEXT PRIMARY KEY,
      payroll_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      contact TEXT DEFAULT '',
      department TEXT,
      permissions TEXT DEFAULT '{}'
    );
  `);

  return db;
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Replicates server.ts calculatePayrollForMonth() exactly as written in lines 821-993
function calculatePayrollForMonth(db, month) {
  const [year, mStr] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mStr, 0).getDate();
  const today = '2026-08-31'; // System test date

  const employees = queryAll(db, 'SELECT * FROM employees WHERE status = "active"');
  const calculatedRecords = [];

  for (const emp of employees) {
    const empOffDates = new Set(
      String(emp.custom_off_dates ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    );

    const [ty, tm, tdRaw] = today.split('-').map(Number);
    let daysToConsider;
    if (year < ty || (year === ty && mStr < tm)) {
      daysToConsider = daysInMonth;
    } else if (year === ty && mStr === tm) {
      daysToConsider = Math.min(tdRaw, daysInMonth);
    } else {
      daysToConsider = 0;
    }

    let totalWorkingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      if (!empOffDates.has(dateStr)) totalWorkingDays++;
    }

    const attRecords = queryAll(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ?', [emp.id, `${month}%`]);

    let daysPresent = 0;
    let daysLate = 0;
    let daysOff = 0;
    let daysLeave = 0;
    for (let d = 1; d <= daysToConsider; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;

      // Line 875 in server.ts: Designated off-date always skipped!
      if (empOffDates.has(dateStr)) {
        daysOff++;
        continue;
      }

      const att = attRecords.find(a => a.date === dateStr);
      if (!att) continue;

      if (att.status === 'present' || att.status === 'half_day') {
        daysPresent++;
      } else if (att.status === 'late') {
        daysPresent++;
        daysLate++;
      } else if (att.status === 'leave') {
        daysLeave++;
      } else if (att.status === 'weekly_off') {
        daysOff++;
      }
    }

    let daysAbsent = daysToConsider - (daysPresent + daysOff + daysLeave);
    if (daysAbsent < 0) daysAbsent = 0;

    // Line 902 in server.ts: CRITICAL BUG! Uses created_at LIKE `${month}%`
    const adjustments = queryAll(db, 'SELECT * FROM payroll_adjustments WHERE employee_id = ? AND created_at LIKE ?', [emp.id, `${month}%`]);
    let totalBonuses = 0;
    let totalFines = 0;
    let advanceDeductions = 0;

    adjustments.forEach(adj => {
      if (adj.type === 'bonus') totalBonuses += adj.amount;
      if (adj.type === 'fine') totalFines += adj.amount;
      if (adj.type === 'advance_deduction') advanceDeductions += adj.amount;
    });

    let grossEarnings = 0;
    let absentDeductions = 0;
    let netPayout = 0;
    let baseRate = emp.base_salary;

    if (emp.employment_type === 'daily_wage') {
      baseRate = emp.base_salary;
      grossEarnings = baseRate * daysPresent;
      absentDeductions = Math.round(baseRate * daysAbsent);
      netPayout = grossEarnings + totalBonuses - totalFines - advanceDeductions;
    } else {
      const perDayRate = daysInMonth > 0 ? emp.base_salary / daysInMonth : 0;
      grossEarnings = emp.base_salary;
      absentDeductions = Math.round(perDayRate * daysAbsent);
      netPayout = grossEarnings - absentDeductions + totalBonuses - totalFines - advanceDeductions;
    }

    netPayout = Math.max(0, netPayout);

    calculatedRecords.push({
      employee_id: emp.id,
      month,
      daysPresent,
      daysAbsent,
      daysOff,
      grossEarnings,
      absentDeductions,
      totalBonuses,
      totalFines,
      advanceDeductions,
      netPayout
    });
  }

  return calculatedRecords;
}

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 1: Silent Loss of Payroll Adjustments Created Post Month-End
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 1: Adjustments created in month N for month N-1 silently vanish from payroll', async () => {
  const db = await setupTestDb();

  // Onboard an active monthly employee
  db.run(`
    INSERT INTO employees (id, employee_code, name, email, phone, cnic, department, designation, joining_date, employment_type, base_salary, shift_id, created_at)
    VALUES ('emp_1', 'EMP-1001', 'Test Worker', 'test@test.com', '1234567890', '42101-1234567-1', 'Ops', 'Staff', '2026-01-01', 'monthly_salary', 60000, 'shift_1', '2026-01-01')
  `);

  // On August 31st (today), HR realizes they need to add a bonus of 5,000 for JULY 2026 (2026-07)
  const targetMonth = '2026-07';
  const creationDate = '2026-08-31T12:00:00.000Z'; // Created today
  const payrollId = `pay_emp_1_${targetMonth}`;

  db.run(`
    INSERT INTO payroll_adjustments (id, payroll_id, employee_id, type, amount, description, created_at)
    VALUES ('adj_1', ?, 'emp_1', 'bonus', 5000, 'July Performance Bonus', ?)
  `, [payrollId, creationDate]);

  // Run calculatePayrollForMonth for July 2026
  const julyPayroll = calculatePayrollForMonth(db, targetMonth);

  // In the real code: query checks `created_at LIKE '2026-07%'`
  // But created_at is '2026-08-31...' so the bonus is 0!
  assert.equal(julyPayroll[0].totalBonuses, 0, 'PROVED BUG: Bonus for July was not included in July payroll because created_at is in August!');
  
  // Worse: When August payroll is calculated, the bonus wrongly bleeds into August!
  const augustPayroll = calculatePayrollForMonth(db, '2026-08');
  assert.equal(augustPayroll[0].totalBonuses, 5000, 'PROVED BUG: July bonus was erroneously applied to August payroll because created_at matched August!');
});

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 2: Night Shift / Overnight Hours Worked Calculation Evaluates to 0
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 2: Overnight shift (e.g. 20:00 to 04:00) computes 0 hours worked', () => {
  // Replicating server.ts line 1020-1024:
  function calculateHoursWorked(finalInTime, finalOutTime) {
    const [inH, inM] = finalInTime.split(':').map(Number);
    const [outH, outM] = finalOutTime.split(':').map(Number);
    return Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 10) / 10);
  }

  // Employee checks in at 20:00 and checks out at 04:00 next day (8 hours of actual work)
  const hoursWorked = calculateHoursWorked('20:00', '04:00');

  // Because outH (4) * 60 - inH (20) * 60 is negative (-960), Math.max(0, -16) returns 0!
  assert.equal(hoursWorked, 0, 'PROVED BUG: Overnight shift hours worked is calculated as 0 instead of 8 hours!');
});

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 3: Flawed Self-Account Deletion Comparison Allows Suicide
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 3: User self-deletion prevention check compares name with email', () => {
  const currentUser = {
    userId: 'usr_admin',
    email: 'admin@mohsinco.com',
    role: 'super_admin'
  };

  const targetUserInDb = {
    id: 'usr_admin',
    name: 'Super Administrator',
    email: 'admin@mohsinco.com'
  };

  // The actual check in server.ts line 1649:
  const isBlocked = (targetUserInDb?.name === currentUser.email);

  assert.equal(isBlocked, false, 'PROVED BUG: "Super Administrator" !== "admin@mohsinco.com", so self-deletion is allowed!');
});

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 4: Working on Designated Off-Day is Unpaid for Daily Wage Workers
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 4: Daily wage worker working on custom off-day gets PKR 0 earnings', async () => {
  const db = await setupTestDb();

  // Employee has Sunday 2026-08-02 as a designated custom off-date
  db.run(`
    INSERT INTO employees (id, employee_code, name, email, phone, cnic, department, designation, joining_date, employment_type, base_salary, custom_off_dates, shift_id, created_at)
    VALUES ('emp_dw', 'EMP-2001', 'Daily Labor', 'dw@test.com', '1234567890', '42101-1111111-1', 'Site', 'Worker', '2026-01-01', 'daily_wage', 2000, '2026-08-02', 'shift_1', '2026-01-01')
  `);

  // Worker actually came in and worked on Sunday 2026-08-02
  db.run(`
    INSERT INTO attendance (id, employee_id, date, check_in_time, check_out_time, status, hours_worked, is_manual_override)
    VALUES ('att_1', 'emp_dw', '2026-08-02', '09:00:00', '17:00:00', 'present', 8, 1)
  `);

  const payroll = calculatePayrollForMonth(db, '2026-08');

  // Because 2026-08-02 is in custom_off_dates, line 875 does `daysOff++; continue;`
  // It completely ignores the attendance row where status = 'present'!
  assert.equal(payroll[0].daysPresent, 0, 'PROVED BUG: Work on off-day was ignored, daysPresent is 0');
  assert.equal(payroll[0].grossEarnings, 0, 'PROVED BUG: Daily wage worker earned PKR 0 despite working full 8 hours on Sunday!');
});

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 5: Half-Day Attendance Counted as 100% Full Present Day
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 5: Half-day attendance receives full 100% daily wage without proration', async () => {
  const db = await setupTestDb();

  db.run(`
    INSERT INTO employees (id, employee_code, name, email, phone, cnic, department, designation, joining_date, employment_type, base_salary, custom_off_dates, shift_id, created_at)
    VALUES ('emp_hd', 'EMP-3001', 'Half Day Worker', 'hd@test.com', '1234567890', '42101-2222222-1', 'Ops', 'Staff', '2026-01-01', 'daily_wage', 3000, '', 'shift_1', '2026-01-01')
  `);

  // Employee worked only half day (status = 'half_day')
  db.run(`
    INSERT INTO attendance (id, employee_id, date, check_in_time, check_out_time, status, hours_worked, is_manual_override)
    VALUES ('att_hd', 'emp_hd', '2026-08-01', '09:00:00', '13:00:00', 'half_day', 4, 1)
  `);

  const payroll = calculatePayrollForMonth(db, '2026-08');

  // Line 883: `if (att.status === 'present' || att.status === 'half_day') daysPresent++;`
  assert.equal(payroll[0].daysPresent, 1, 'PROVED BUG: Half-day counted as 1 full day');
  assert.equal(payroll[0].grossEarnings, 3000, 'PROVED BUG: Employee received full PKR 3000 instead of PKR 1500 for a half-day!');
});

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 6: Future Month Payout Computes 100% Base Salary for Zero Work
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 6: Monthly salary employees get full 100% salary for future unworked month', async () => {
  const db = await setupTestDb();

  db.run(`
    INSERT INTO employees (id, employee_code, name, email, phone, cnic, department, designation, joining_date, employment_type, base_salary, custom_off_dates, shift_id, created_at)
    VALUES ('emp_fut', 'EMP-4001', 'Future Worker', 'fut@test.com', '1234567890', '42101-3333333-1', 'Admin', 'Officer', '2026-01-01', 'monthly_salary', 80000, '', 'shift_1', '2026-01-01')
  `);

  // Calculate payroll for next month (2026-09) when today is 2026-08-31
  const futurePayroll = calculatePayrollForMonth(db, '2026-09');

  // Line 851: daysToConsider = 0 => daysAbsent = 0 => gross = 80000, absentDeductions = 0, net = 80000
  assert.equal(futurePayroll[0].daysPresent, 0, 'Days present is 0');
  assert.equal(futurePayroll[0].daysAbsent, 0, 'Days absent is 0 (unpenalized)');
  assert.equal(futurePayroll[0].netPayout, 80000, 'PROVED BUG: Employee is awarded full PKR 80,000 net payout for a month in the future!');
});

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 7: Biometric Accidental Double Punch Causes Immediate 0-Hour Check-Out
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 7: Rapid double-punch on biometric terminal logs immediate check-out with 0 hours worked', async () => {
  const db = await setupTestDb();

  db.run(`
    INSERT INTO employees (id, employee_code, name, email, phone, cnic, department, designation, joining_date, employment_type, base_salary, custom_off_dates, shift_id, created_at)
    VALUES ('emp_punch', 'EMP-5001', 'Punch Worker', 'punch@test.com', '1234567890', '42101-4444444-1', 'Admin', 'Officer', '2026-01-01', 'monthly_salary', 50000, '', 'shift_1', '2026-01-01')
  `);

  // Emulate server.ts line 302-323 processBiometricPunch
  function processBiometricPunch(empId, punchDate, punchTime) {
    const existingAtt = queryOne(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [empId, punchDate]);
    const [punchHour, punchMin] = punchTime.split(':').map(Number);

    if (!existingAtt) {
      // First punch: Check-in
      db.run(`
        INSERT INTO attendance (id, employee_id, date, check_in_time, check_out_time, status, hours_worked, late_minutes, is_manual_override)
        VALUES (?, ?, ?, ?, NULL, 'present', 0, 0, 0)
      `, [`att_${empId}_${punchDate}`, empId, punchDate, punchTime]);
    } else {
      // Subsequent punch: Check-out
      const checkInTime = existingAtt.check_in_time || '09:00:00';
      const [cInH, cInM] = checkInTime.split(':').map(Number);
      const hoursWorked = Math.max(0, Math.round(((punchHour * 60 + punchMin) - (cInH * 60 + cInM)) / 60 * 10) / 10);
      db.run(`
        UPDATE attendance SET check_out_time = ?, hours_worked = ? WHERE employee_id = ? AND date = ?
      `, [punchTime, hoursWorked, empId, punchDate]);
    }
  }

  // Employee checks in at 09:00:00
  processBiometricPunch('emp_punch', '2026-08-10', '09:00:00');
  let att = queryOne(db, 'SELECT * FROM attendance WHERE employee_id = "emp_punch"');
  assert.equal(att.check_in_time, '09:00:00');
  assert.equal(att.check_out_time, null);

  // Employee's finger slips and punches again at 09:00:10 (10 seconds later)
  processBiometricPunch('emp_punch', '2026-08-10', '09:00:10');
  att = queryOne(db, 'SELECT * FROM attendance WHERE employee_id = "emp_punch"');

  // Because the code assumes ANY subsequent punch is a check-out, the employee is now checked out!
  assert.equal(att.check_out_time, '09:00:10', 'PROVED BUG: Accidental second punch registered as official check-out!');
  assert.equal(att.hours_worked, 0, 'PROVED BUG: Total hours worked collapsed to 0.0 despite employee staying all day!');
});

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 8: Stored XSS in Raw Print Template HTML Interpolation
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 8: Direct string interpolation in printFormattedDocument enables Stored XSS', () => {
  // In ReportsView.tsx and PayrollView.tsx:
  // `doc.file_name` or `employee.name` or `companyLogo` are injected directly into an HTML string
  const maliciousEmployeeName = '<img src=x onerror="alert(document.cookie)">';
  const maliciousLogoUrl = 'https://example.com/logo.png" onload="alert(1)" data="';

  // Emulate line 182 in ReportsView.tsx:
  const headerHtml = `<div class="brand">${maliciousLogoUrl ? `<img src="${maliciousLogoUrl}" alt="Logo" />` : ''}<span>${maliciousEmployeeName}</span></div>`;

  // Without HTML escaping, the payload breaks out of the src attribute and renders the raw script/handlers
  assert.equal(headerHtml.includes('onload="alert(1)"'), true, 'PROVED BUG: Logo URL contains unescaped event handler injection!');
  assert.equal(headerHtml.includes('<img src=x onerror="alert(document.cookie)">'), true, 'PROVED BUG: Employee name contains unescaped HTML/XSS injection!');
});

// -----------------------------------------------------------------------------
// REPRODUCTION TEST 9: Unchecked Type Coercion in Salary Field
// -----------------------------------------------------------------------------
test('BUG REPRODUCTION 9: Employee onboarding allows NaN or invalid salary if string parsing falls back', () => {
  // In EmployeeManagementView.tsx line 361:
  // base_salary: parseFloat(salaryStr) || 0
  assert.equal(parseFloat(''), NaN);
  assert.equal(parseFloat('abc') || 0, 0);
  assert.equal(parseFloat('-5000'), -5000); // Negative salary allowed by parseFloat
  // In createEmployeeSchema: base_salary: z.number().nonnegative()
  // But if passed as a string or if partial update passes without type coercion, negative salary can trigger DB inconsistencies
});

