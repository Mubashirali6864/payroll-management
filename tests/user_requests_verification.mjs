import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000';
let authToken = '';

test('0. Setup admin auth', async () => {
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@mohsinco.com',
      password: 'MohsinCoSecure2026!'
    })
  });
  assert.equal(loginRes.status, 200, 'Admin login must succeed');
  const data = await loginRes.json();
  authToken = data.token;
});

test('1. Pakistani CNIC Format Restriction', async () => {
  // Test invalid CNIC format: without hyphens or wrong digit length
  const invalidEmpRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      employee_code: `TEST-CNIC-INV-${Date.now()}`,
      name: 'Test Invalid CNIC',
      email: `test_inv_${Date.now()}@mohsinco.com`,
      phone: '03001234567',
      cnic: '4210112345671', // Missing hyphens
      department: 'Engineering',
      designation: 'Staff',
      joining_date: '2026-10-01',
      employment_type: 'daily_wage',
      base_salary: 1000
    })
  });
  assert.equal(invalidEmpRes.status, 400, 'Invalid CNIC format must be rejected with 400');
  const invalidData = await invalidEmpRes.json();
  assert.ok(invalidData.details?.fieldErrors?.cnic || invalidData.error?.includes('CNIC'), 'Validation error must mention CNIC');

  // Test valid CNIC format: 42101-1234567-1
  const validEmpRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      employee_code: `TEST-CNIC-OK-${Date.now()}`,
      name: 'Test Valid CNIC',
      email: `test_ok_${Date.now()}@mohsinco.com`,
      phone: '03001234567',
      cnic: '42101-1234567-1',
      department: 'Engineering',
      designation: 'Staff',
      joining_date: '2026-10-01',
      employment_type: 'daily_wage',
      base_salary: 1000
    })
  });
  assert.equal(validEmpRes.status, 200, 'Valid Pakistani CNIC (42101-1234567-1) must be accepted');
  const validData = await validEmpRes.json();
  assert.equal(validData.cnic, '42101-1234567-1');

  // Clean up test employee
  await fetch(`${BASE_URL}/api/employees/${validData.id}?force=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` }
  });
});

test('2. Delete Employee with Admin Password Confirmation', async () => {
  // Create an employee to delete
  const createRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      employee_code: `TEST-DEL-${Date.now()}`,
      name: 'Employee To Delete',
      email: `del_${Date.now()}@mohsinco.com`,
      phone: '03001234567',
      cnic: '42101-9876543-2',
      department: 'Operations',
      designation: 'Staff',
      joining_date: '2026-10-01',
      employment_type: 'monthly_salary',
      base_salary: 50000
    })
  });
  assert.equal(createRes.status, 200);
  const emp = await createRes.json();

  // Attempt delete with wrong admin password -> MUST return 401
  const wrongPassRes = await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      admin_password: 'WrongPassword123!'
    })
  });
  assert.equal(wrongPassRes.status, 401, 'Wrong admin password must be rejected with 401');
  const wrongPassData = await wrongPassRes.json();
  assert.ok(wrongPassData.error?.includes('password'), 'Error message must specify password failure');

  // Verify employee is NOT deleted
  const checkRes = await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  assert.equal(checkRes.status, 200, 'Employee should still exist');

  // Attempt delete with correct admin password -> MUST succeed
  const correctPassRes = await fetch(`${BASE_URL}/api/employees/${emp.id}?force=true`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      admin_password: 'MohsinCoSecure2026!'
    })
  });
  assert.equal(correctPassRes.status, 200, 'Delete with correct admin password must succeed');
});

test('3. Attendance Backdating Allowed Freely (No Red Cross / 400 Error)', async () => {
  // Create an employee with joining_date = today (e.g., 2026-10-17)
  const today = '2026-10-17';
  const yesterday = '2026-10-16';
  const twoDaysAgo = '2026-10-15';

  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      employee_code: `TEST-BACKDATE-${Date.now()}`,
      name: 'Backdate Test Employee',
      email: `backdate_${Date.now()}@mohsinco.com`,
      phone: '03009998877',
      cnic: '42201-1122334-5',
      department: 'Operations',
      designation: 'Worker',
      joining_date: today,
      employment_type: 'daily_wage',
      base_salary: 1000
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // Now record/correct attendance for yesterday (backdating prior to joining_date)
  const backdateRes = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: yesterday,
      status: 'present',
      check_in_time: '09:00:00',
      check_out_time: '17:00:00',
      reason: 'Backdated correction for yesterday'
    })
  });
  assert.equal(backdateRes.status, 200, `Backdated attendance override must succeed (got ${backdateRes.status})`);
  const backdateData = await backdateRes.json();
  assert.equal(backdateData.success, true);

  // Verify record was inserted with status 'present'
  const attCheckRes = await fetch(`${BASE_URL}/api/attendance?date=${yesterday}`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const attRecords = await attCheckRes.json();
  const myAtt = attRecords.find(a => a.employee_id === emp.id);
  assert.ok(myAtt, 'Attendance record must exist');
  assert.equal(myAtt.status, 'present', 'Attendance status should be present');

  // Verify joining_date was automatically adjusted to permit the historical record
  const updatedEmpRes = await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const updatedEmp = await updatedEmpRes.json();
  assert.ok(updatedEmp.joining_date <= yesterday, `joining_date (${updatedEmp.joining_date}) must be adjusted to <= ${yesterday}`);

  // Clean up
  await fetch(`${BASE_URL}/api/employees/${emp.id}?force=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` }
  });
});

test('4. Salary Calculation for Daily Wage & Late Arrivals (User scenario: 1000/day, 4 days worked -> 4,000, NOT 20,323)', async () => {
  // Create daily wage worker with 1,000/day rate
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      employee_code: `TEST-WAGE-${Date.now()}`,
      name: 'Daily Wage Test Worker',
      email: `wage_${Date.now()}@mohsinco.com`,
      phone: '03005556677',
      cnic: '42301-5566778-9',
      department: 'Operations',
      designation: 'Worker',
      joining_date: '2026-10-01',
      employment_type: 'daily_wage',
      base_salary: 1000
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // User scenario:
  // Present for 1 day (e.g. 2026-10-01)
  // Late for 2 days (e.g. 2026-10-02, 2026-10-03)
  // Present for 1 day (e.g. 2026-10-04)
  // Total 4 days worked!
  const attendanceDays = [
    { date: '2026-10-01', status: 'present', check_in: '09:00:00', check_out: '17:00:00' },
    { date: '2026-10-02', status: 'late', check_in: '09:25:00', check_out: '17:00:00' }, // Within 30m grace
    { date: '2026-10-03', status: 'late', check_in: '09:45:00', check_out: '17:00:00' }, // Past 30m grace, but worked full day
    { date: '2026-10-04', status: 'present', check_in: '09:00:00', check_out: '17:00:00' }
  ];

  for (const att of attendanceDays) {
    const r = await fetch(`${BASE_URL}/api/attendance/override`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        employee_id: emp.id,
        date: att.date,
        status: att.status,
        check_in_time: att.check_in,
        check_out_time: att.check_out,
        reason: 'Test attendance'
      })
    });
    assert.equal(r.status, 200);
  }

  // Calculate payroll for October 2026 for this employee
  const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      month: '2026-10',
      employee_ids: [emp.id]
    })
  });
  assert.equal(calcRes.status, 200);
  const calcData = await calcRes.json();
  const payrollRecord = Array.isArray(calcData) ? calcData.find(p => p.employee_id === emp.id) : calcData;
  assert.ok(payrollRecord, 'Payroll record must exist');

  // Daily wage rate is 1,000/day. 4 days worked (2 present, 2 late) = 4,000.
  // Late arrivals must NOT deduct salary or cause 20,323 calculation!
  assert.equal(payrollRecord.days_present, 4, `Days present should be 4 (including late days worked), got ${payrollRecord.days_present}`);
  assert.equal(payrollRecord.net_payout, 4000, `Net payout should be exactly 4,000, got ${payrollRecord.net_payout}`);
  assert.equal(payrollRecord.absent_deductions, 0, `Absent deductions should be 0 for daily wage earners, got ${payrollRecord.absent_deductions}`);

  // Clean up
  await fetch(`${BASE_URL}/api/employees/${emp.id}?force=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` }
  });
});

test('5. Complete Attendance History Display', async () => {
  const attRes = await fetch(`${BASE_URL}/api/attendance`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  assert.equal(attRes.status, 200);
  const history = await attRes.json();
  assert.ok(Array.isArray(history), 'Attendance records must be an array');
  assert.ok(history.length > 0, 'History should contain records');
  // Verify each record has employee name resolved
  const hasNames = history.some(r => Boolean(r.employee_name));
  assert.ok(hasNames, 'Attendance records should have employee_name populated');
});
