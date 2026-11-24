import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000';

test('Daily Rate Rounding: 30k base salary divided by 31 days rounds to 968/day, so 2 days absent yields 1936 deduction', async () => {
  // 1. Super Admin Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@mohsinco.com',
      password: 'MohsinCoSecure2026!'
    })
  });
  assert.equal(loginRes.status, 200);
  const { token } = await loginRes.json();

  // 2. Create test employee with 30,000 monthly salary joined before 2026-08
  const testCode = `EMP_${Date.now().toString().slice(-4)}`;
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_code: testCode,
      name: 'Daily Rate Test User',
      email: `test_daily_${Date.now()}@mohsinco.com`,
      phone: '03001234567',
      cnic: '42101-1234567-9',
      department: 'Engineering',
      designation: 'Staff',
      joining_date: '2026-08-01',
      employment_type: 'monthly_salary',
      base_salary: 30000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  try {
    // 3. Mark 2 absent days for 2026-08 (31 days)
    await fetch(`${BASE_URL}/api/attendance`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: emp.id,
        date: '2026-08-10',
        status: 'absent',
        reason: 'Unexcused absence day 1'
      })
    });

    await fetch(`${BASE_URL}/api/attendance`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: emp.id,
        date: '2026-08-11',
        status: 'absent',
        reason: 'Unexcused absence day 2'
      })
    });

    // Mark remaining 29 days as present so days_absent is exactly 2
    const bulkEntries = [];
    for (let d = 1; d <= 31; d++) {
      if (d === 10 || d === 11) continue;
      bulkEntries.push({
        employee_id: emp.id,
        date: `2026-08-${String(d).padStart(2, '0')}`,
        check_in_time: '09:00:00',
        check_out_time: '17:00:00',
        status: 'present',
        reason: 'Regular work day'
      });
    }

    await fetch(`${BASE_URL}/api/attendance/bulk-override`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ entries: bulkEntries })
    });

    // 4. Calculate payroll for 2026-08
    const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ month: '2026-08' })
    });
    assert.equal(calcRes.status, 200);
    const records = await calcRes.json();
    const record = records.find(r => r.employee_id === emp.id);
    assert.ok(record, 'Payroll record should exist');

    assert.equal(record.days_absent, 2, 'Should have exactly 2 absent days');
    // Daily rate = Math.round(30000 / 31) = 968
    // Deduction for 2 days = 968 * 2 = 1936 (NOT 1935)
    assert.equal(
      record.absent_deductions,
      1936,
      `Expected absent_deductions to be 1936 (968 * 2), but got ${record.absent_deductions}`
    );
    assert.equal(
      record.net_payout,
      30000 - 1936,
      `Expected net_payout to be 28064 (30000 - 1936), but got ${record.net_payout}`
    );
  } finally {
    // Teardown
    await fetch(`${BASE_URL}/api/employees/${emp.id}?force=true`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  }
});
