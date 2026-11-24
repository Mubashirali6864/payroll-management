import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from '../mohsin-&-co-payroll-&-attendance/node_modules/sql.js/dist/sql-wasm.js';

// --- CORE CALCULATION ENGINES (Mirroring server.ts) ---

function calculateHoursWorked(inTime, outTime) {
  const [inH, inM] = inTime.split(':').map(Number);
  const [outH, outM] = outTime.split(':').map(Number);
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return 0;
  let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60; // 24-hour midnight rollover
  }
  return Math.max(0, Math.round((diffMinutes / 60) * 10) / 10);
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) stmt.bind(params.map(p => (p === undefined ? null : p)));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function calculatePayrollForMonth(db, month, simulatedToday = '2026-08-31') {
  const [year, mStr] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mStr, 0).getDate();
  const today = simulatedToday;
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const employees = queryAll(db, 'SELECT * FROM employees WHERE status = "active"');
  const calculatedRecords = [];

  for (const emp of employees) {
    if (emp.joining_date && emp.joining_date > monthEnd) continue;
    if (emp.exit_date && emp.exit_date < monthStart) continue;

    let empStartDay = 1;
    if (emp.joining_date && emp.joining_date >= monthStart && emp.joining_date <= monthEnd) {
      empStartDay = parseInt(emp.joining_date.split('-')[2], 10);
    }

    let empEndDay = daysInMonth;
    if (emp.exit_date && emp.exit_date >= monthStart && emp.exit_date <= monthEnd) {
      empEndDay = parseInt(emp.exit_date.split('-')[2], 10);
    }

    const empOffDates = new Set(
      String(emp.custom_off_dates ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    );

    if (emp.weekly_off_day !== undefined && emp.weekly_off_day !== null && String(emp.weekly_off_day).trim() !== '') {
      const weeklyOffSet = new Set(
        String(emp.weekly_off_day)
          .split(',')
          .map(s => s.trim())
          .filter(s => s !== '' && !isNaN(Number(s)))
          .map(Number)
      );
      for (let d = 1; d <= daysInMonth; d++) {
        const dayOfWeek = new Date(year, mStr - 1, d).getDay();
        if (weeklyOffSet.has(dayOfWeek)) {
          empOffDates.add(`${month}-${String(d).padStart(2, '0')}`);
        }
      }
    }

    const [ty, tm, tdRaw] = today.split('-').map(Number);
    let daysToConsider;
    if (year < ty || (year === ty && mStr < tm)) {
      daysToConsider = daysInMonth;
    } else if (year === ty && mStr === tm) {
      daysToConsider = Math.min(tdRaw, daysInMonth);
    } else {
      daysToConsider = 0;
    }
    daysToConsider = Math.min(daysToConsider, empEndDay);

    const attRecords = queryAll(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ?', [emp.id, `${month}%`]);

    let daysPresent = 0;
    let halfDays = 0;
    let daysLate = 0;
    let daysOff = 0;
    let daysLeave = 0;
    let daysWorkedOnOffFull = 0;
    let daysWorkedOnOffHalf = 0;

    const elapsedActiveDays = Math.max(0, daysToConsider >= empStartDay ? (daysToConsider - empStartDay + 1) : 0);

    for (let d = empStartDay; d <= daysToConsider; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      const att = attRecords.find(a => a.date === dateStr);
      const workedOnOffDay = att && (att.status === 'present' || att.status === 'late' || att.status === 'half_day' || (att.hours_worked && att.hours_worked > 0));

      if (empOffDates.has(dateStr)) {
        daysOff++;
        if (workedOnOffDay) {
          if (att.status === 'half_day' || (att.hours_worked && att.hours_worked < 4)) {
            daysWorkedOnOffHalf++;
            halfDays++;
          } else {
            daysWorkedOnOffFull++;
            daysPresent++;
          }
        }
        continue;
      }

      if (!att) continue;

      if (att.status === 'present') {
        daysPresent++;
        if ((att.late_minutes || 0) > 0) daysLate++;
      } else if (att.status === 'half_day') {
        halfDays++;
        if ((att.late_minutes || 0) > 0) daysLate++;
      } else if (att.status === 'late') {
        daysPresent++;
        daysLate++;
      } else if (att.status === 'leave') {
        daysLeave++;
      } else if (att.status === 'weekly_off') {
        daysOff++;
        if (workedOnOffDay) {
          if (att.hours_worked && att.hours_worked < 4) {
            daysWorkedOnOffHalf++;
            halfDays++;
          } else {
            daysWorkedOnOffFull++;
            daysPresent++;
          }
        }
      }
    }

    const explicitOffDays = attRecords.filter(a => a.status === 'weekly_off').length;
    const explicitAbsentDays = attRecords.filter(a => a.status === 'absent').length;
    if (explicitOffDays > 0) {
      daysOff = explicitOffDays;
    }

    // Deduct off-day work equivalent so working on off-days never creates phantom absences
    const offDayWorkCredit = daysWorkedOnOffFull + (0.5 * daysWorkedOnOffHalf);
    let computedAbsent = elapsedActiveDays - ((daysPresent + (0.5 * halfDays)) - offDayWorkCredit + daysOff + daysLeave);
    if (computedAbsent < 0) computedAbsent = 0;
    let daysAbsent = Math.max(explicitAbsentDays, computedAbsent);

    const adjustments = queryAll(db, `
      SELECT * FROM payroll_adjustments 
      WHERE employee_id = ? AND (payroll_id = ? OR payroll_id LIKE ? OR (payroll_id IS NULL AND created_at LIKE ?))
    `, [emp.id, `pay_${emp.id}_${month}`, `%_${month}`, `${month}%`]);

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
    const perDayRate = daysInMonth > 0 ? Math.round(emp.base_salary / daysInMonth) : 0;

    if (emp.employment_type === 'daily_wage') {
      baseRate = emp.base_salary;
      grossEarnings = (baseRate * daysPresent) + (baseRate * 0.5 * halfDays);
      absentDeductions = 0;
      netPayout = grossEarnings + totalBonuses - totalFines - advanceDeductions;
    } else {
      const payableDays = daysPresent + (0.5 * halfDays) + daysOff + daysLeave;
      if (daysToConsider === 0) {
        grossEarnings = 0;
        absentDeductions = 0;
        netPayout = totalBonuses - totalFines - advanceDeductions;
      } else if (empStartDay === 1 && empEndDay === daysInMonth) {
        grossEarnings = emp.base_salary;
        absentDeductions = Math.min(emp.base_salary, Math.round(perDayRate * daysAbsent));
        netPayout = grossEarnings - absentDeductions + totalBonuses - totalFines - advanceDeductions;
      } else {
        const earnedSalary = Math.round(payableDays * perDayRate);
        absentDeductions = Math.round(perDayRate * daysAbsent);
        grossEarnings = Math.min(emp.base_salary, earnedSalary + absentDeductions);
        netPayout = earnedSalary + totalBonuses - totalFines - advanceDeductions;
      }
    }

    netPayout = Math.max(0, netPayout);
    calculatedRecords.push({
      employee_id: emp.id,
      gross_earnings: grossEarnings,
      absent_deductions: absentDeductions,
      total_bonuses: totalBonuses,
      total_fines: totalFines,
      advance_deductions: advanceDeductions,
      net_payout: netPayout,
      days_present: daysPresent,
      half_days: halfDays,
      days_absent: daysAbsent,
      days_off: daysOff,
      days_leave: daysLeave
    });
  }

  return calculatedRecords;
}

async function createTestDb() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      employee_code TEXT NOT NULL,
      employment_type TEXT NOT NULL,
      base_salary REAL NOT NULL,
      joining_date TEXT,
      exit_date TEXT,
      custom_off_dates TEXT,
      weekly_off_day TEXT,
      shift_id TEXT,
      status TEXT DEFAULT 'active'
    );
    CREATE TABLE attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      status TEXT NOT NULL,
      hours_worked REAL DEFAULT 0,
      late_minutes INTEGER DEFAULT 0
    );
    CREATE TABLE payroll_adjustments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      payroll_id TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at TEXT
    );
  `);
  return db;
}

// ============================================================================
// TEST SUITES
// ============================================================================

test('1. Shift Duration & 24h Rollover Mathematical Verification', () => {
  // Standard day shift: 09:00 -> 17:00 = 8.0h
  assert.equal(calculateHoursWorked('09:00', '17:00'), 8.0);
  // Overnight shift crossing midnight: 20:00 -> 04:00 = 8.0h
  assert.equal(calculateHoursWorked('20:00', '04:00'), 8.0);
  // Overnight shift: 22:30 -> 06:45 = 8.3h (495 mins)
  assert.equal(calculateHoursWorked('22:30', '06:45'), 8.3);
  // Short shift: 10:00 -> 13:30 = 3.5h
  assert.equal(calculateHoursWorked('10:00', '13:30'), 3.5);
  // Invalid string falls back safely to 0
  assert.equal(calculateHoursWorked('invalid', '17:00'), 0);
  assert.equal(calculateHoursWorked('09:00', '09:00'), 0);
});

test('2. Monthly Salary Full Month: Zero Absences Pays 100% Contractual Base', async () => {
  const db = await createTestDb();
  // 31-day month: August 2026. Base salary = 62,000 PKR (perDayRate = 2,000)
  db.run(`INSERT INTO employees VALUES ('emp1', 'Alice', 'E01', 'monthly_salary', 62000, '2026-01-01', NULL, '', '0', 'shift_gen', 'active')`);

  // Log 27 working days present + 4 Sundays weekly off
  for (let d = 1; d <= 31; d++) {
    const dt = `2026-08-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(2026, 7, d).getDay();
    const status = dayOfWeek === 0 ? 'weekly_off' : 'present';
    db.run(`INSERT INTO attendance VALUES ('att_${d}', 'emp1', '${dt}', '09:00', '17:00', '${status}', 8, 0)`);
  }

  const records = calculatePayrollForMonth(db, '2026-08', '2026-08-31');
  assert.equal(records.length, 1);
  const rec = records[0];
  assert.equal(rec.gross_earnings, 62000);
  assert.equal(rec.absent_deductions, 0);
  assert.equal(rec.days_absent, 0);
  assert.equal(rec.net_payout, 62000);
});

test('3. Monthly Salary Prorated Absence Deduction (Exact Daily Rate Calculation)', async () => {
  const db = await createTestDb();
  // Base salary = 31,000 PKR for 31 days (perDayRate = 1,000)
  db.run(`INSERT INTO employees VALUES ('emp2', 'Bob', 'E02', 'monthly_salary', 31000, '2026-01-01', NULL, '', '0', 'shift_gen', 'active')`);

  // Missed 2 working days (August 3 and August 4)
  for (let d = 1; d <= 31; d++) {
    if (d === 3 || d === 4) continue; // Unrecorded => unexcused absence
    const dt = `2026-08-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(2026, 7, d).getDay();
    const status = dayOfWeek === 0 ? 'weekly_off' : 'present';
    db.run(`INSERT INTO attendance VALUES ('att_${d}', 'emp2', '${dt}', '09:00', '17:00', '${status}', 8, 0)`);
  }

  const records = calculatePayrollForMonth(db, '2026-08', '2026-08-31');
  const rec = records[0];
  assert.equal(rec.days_absent, 2);
  assert.equal(rec.absent_deductions, 2000); // 2 * 1,000
  assert.equal(rec.net_payout, 29000); // 31,000 - 2,000
});

test('4. Monthly Salary Half-Day Attendance Deducts Exactly 0.5 Day', async () => {
  const db = await createTestDb();
  // Base salary = 31,000 PKR in August (perDayRate = 1,000)
  db.run(`INSERT INTO employees VALUES ('emp3', 'Charlie', 'E03', 'monthly_salary', 31000, '2026-01-01', NULL, '', '0', 'shift_gen', 'active')`);

  for (let d = 1; d <= 31; d++) {
    const dt = `2026-08-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(2026, 7, d).getDay();
    if (dayOfWeek === 0) {
      db.run(`INSERT INTO attendance VALUES ('att_${d}', 'emp3', '${dt}', NULL, NULL, 'weekly_off', 0, 0)`);
    } else if (d === 10) {
      // 1 Half Day
      db.run(`INSERT INTO attendance VALUES ('att_${d}', 'emp3', '${dt}', '09:00', '13:00', 'half_day', 4, 0)`);
    } else {
      db.run(`INSERT INTO attendance VALUES ('att_${d}', 'emp3', '${dt}', '09:00', '17:00', 'present', 8, 0)`);
    }
  }

  const records = calculatePayrollForMonth(db, '2026-08', '2026-08-31');
  const rec = records[0];
  assert.equal(rec.half_days, 1);
  assert.equal(rec.days_absent, 0.5);
  assert.equal(rec.absent_deductions, 500); // 0.5 * 1000
  assert.equal(rec.net_payout, 30500); // 31,000 - 500
});

test('5. Daily Wage Calculation: Pay Only for Days Worked + Half-Day Proration', async () => {
  const db = await createTestDb();
  // Daily wage rate = 1,200 PKR per day
  db.run(`INSERT INTO employees VALUES ('emp4', 'David', 'D01', 'daily_wage', 1200, '2026-01-01', NULL, '', '0', 'shift_gen', 'active')`);

  // Worked 10 full days + 2 half days
  for (let d = 1; d <= 10; d++) {
    const dt = `2026-08-${String(d).padStart(2, '0')}`;
    db.run(`INSERT INTO attendance VALUES ('att_d_${d}', 'emp4', '${dt}', '09:00', '17:00', 'present', 8, 0)`);
  }
  db.run(`INSERT INTO attendance VALUES ('att_h_1', 'emp4', '2026-08-11', '09:00', '13:00', 'half_day', 4, 0)`);
  db.run(`INSERT INTO attendance VALUES ('att_h_2', 'emp4', '2026-08-12', '09:00', '13:00', 'half_day', 4, 0)`);

  const records = calculatePayrollForMonth(db, '2026-08', '2026-08-31');
  const rec = records[0];
  assert.equal(rec.days_present, 10);
  assert.equal(rec.half_days, 2);
  // Expected gross = (10 * 1200) + (2 * 0.5 * 1200) = 12000 + 1200 = 13200
  assert.equal(rec.gross_earnings, 13200);
  assert.equal(rec.net_payout, 13200);
});

test('6. Daily Wage Working on Designated Off-Day is Fully Compensated', async () => {
  const db = await createTestDb();
  // Daily wage rate = 1,500 PKR. Sunday (day 0) is weekly off.
  db.run(`INSERT INTO employees VALUES ('emp5', 'Eva', 'D02', 'daily_wage', 1500, '2026-01-01', NULL, '', '0', 'shift_gen', 'active')`);

  // Sunday, August 2, 2026 - worked a full shift on off-day
  db.run(`INSERT INTO attendance VALUES ('att_sun', 'emp5', '2026-08-02', '09:00', '17:00', 'present', 8, 0)`);

  const records = calculatePayrollForMonth(db, '2026-08', '2026-08-31');
  const rec = records[0];
  assert.equal(rec.days_present, 1);
  assert.equal(rec.gross_earnings, 1500);
  assert.equal(rec.net_payout, 1500);
});

test('7. Adjustments Isolation: Target Month Matching & Non-Negative Floor', async () => {
  const db = await createTestDb();
  // Monthly salary 50,000
  db.run(`INSERT INTO employees VALUES ('emp6', 'Frank', 'E06', 'monthly_salary', 50000, '2026-01-01', NULL, '', '0', 'shift_gen', 'active')`);

  // All 31 days present in July
  for (let d = 1; d <= 31; d++) {
    const dt = `2026-07-${String(d).padStart(2, '0')}`;
    db.run(`INSERT INTO attendance VALUES ('att_jul_${d}', 'emp6', '${dt}', '09:00', '17:00', 'present', 8, 0)`);
  }

  // Adjustment created in August, targeting July
  db.run(`INSERT INTO payroll_adjustments VALUES ('adj1', 'emp6', 'pay_emp6_2026-07', 'bonus', 5000, 'Performance bonus', '2026-08-02T10:00:00Z')`);
  // Advance deduction targeting July
  db.run(`INSERT INTO payroll_adjustments VALUES ('adj2', 'emp6', 'pay_emp6_2026-07', 'advance_deduction', 2000, 'Advance repaid', '2026-08-02T10:00:00Z')`);
  // Fine targeting August (should NOT affect July)
  db.run(`INSERT INTO payroll_adjustments VALUES ('adj3', 'emp6', 'pay_emp6_2026-08', 'fine', 3000, 'Safety violation', '2026-08-05T10:00:00Z')`);

  const julyRecords = calculatePayrollForMonth(db, '2026-07', '2026-08-31');
  const julyRec = julyRecords[0];
  assert.equal(julyRec.gross_earnings, 50000);
  assert.equal(julyRec.total_bonuses, 5000);
  assert.equal(julyRec.advance_deductions, 2000);
  assert.equal(julyRec.total_fines, 0); // August fine did NOT bleed into July!
  // Net = 50,000 + 5,000 - 2,000 = 53,000
  assert.equal(julyRec.net_payout, 53000);

  // Excessive fine test: Fine of 70,000 on 50,000 salary floors net at 0
  db.run(`INSERT INTO payroll_adjustments VALUES ('adj_big', 'emp6', 'pay_emp6_2026-07', 'fine', 70000, 'Heavy fine', '2026-07-31T10:00:00Z')`);
  const flooredRecords = calculatePayrollForMonth(db, '2026-07', '2026-08-31');
  assert.equal(flooredRecords[0].net_payout, 0); // 50000 + 5000 - 2000 - 70000 = -17000 => floored to 0
});

test('8. Mid-Month Joiner Prorated Calculation', async () => {
  const db = await createTestDb();
  // Employee joins on August 16, 2026 (16 days active out of 31). Base = 31,000 (1,000/day)
  db.run(`INSERT INTO employees VALUES ('emp7', 'Grace', 'E07', 'monthly_salary', 31000, '2026-08-16', NULL, '', '0', 'shift_gen', 'active')`);

  // Worked all working days from August 16 to August 31 (13 working days + 3 Sundays off)
  for (let d = 16; d <= 31; d++) {
    const dt = `2026-08-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(2026, 7, d).getDay();
    const isSunday = dayOfWeek === 0;
    const status = isSunday ? 'weekly_off' : 'present';
    const hours = isSunday ? 0 : 8;
    const inTime = isSunday ? null : '09:00';
    const outTime = isSunday ? null : '17:00';
    db.run(`INSERT INTO attendance VALUES ('att_mid_${d}', 'emp7', '${dt}', ${inTime ? `'${inTime}'` : 'NULL'}, ${outTime ? `'${outTime}'` : 'NULL'}, '${status}', ${hours}, 0)`);
  }

  const records = calculatePayrollForMonth(db, '2026-08', '2026-08-31');
  const rec = records[0];
  assert.equal(rec.days_absent, 0); // Days 1..15 before joining date are NOT charged as absent!
  assert.equal(rec.gross_earnings, 16000); // 16 payable days * 1,000
  assert.equal(rec.net_payout, 16000);
});

test('9. Future Unelapsed Month Returns Zero Gross and Zero Unearned Salary', async () => {
  const db = await createTestDb();
  db.run(`INSERT INTO employees VALUES ('emp8', 'Henry', 'E08', 'monthly_salary', 40000, '2026-01-01', NULL, '', '0', 'shift_gen', 'active')`);

  // When simulatedToday is 2026-08-31, September 2026 is completely in the future
  const records = calculatePayrollForMonth(db, '2026-09', '2026-08-31');
  const rec = records[0];
  assert.equal(rec.gross_earnings, 0);
  assert.equal(rec.absent_deductions, 0);
  assert.equal(rec.net_payout, 0);
});
