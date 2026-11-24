import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000';

let authToken = '';

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@mohsinco.com', password: 'changeme123' })
  });
  const data = await res.json();
  return data.token;
}

test('ADVERSARIAL 1: Public Financial Leakage on /api/dashboard/metrics', async () => {
  // Attempt unauthenticated GET
  const res = await fetch(`${BASE_URL}/api/dashboard/metrics`);
  assert.equal(res.status, 200, 'Endpoint should return 200 without Authorization header');
  const data = await res.json();
  assert.ok(typeof data.total_employees === 'number', 'total_employees exposed');
  assert.ok(typeof data.today_payroll_accrual === 'number', 'today_payroll_accrual exposed');
  assert.ok(typeof data.monthly_salary_baseline === 'number', 'monthly_salary_baseline exposed');
});

test('ADVERSARIAL 3: Self-Account Deletion Prevention Check Logic Flaw', async () => {
  authToken = await login();

  // Inspect the current user ID
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const me = await meRes.json();
  assert.equal(me.userId, 'usr_1');
  assert.equal(me.email, 'admin@mohsinco.com');

  // Verify server logic by querying user from settings
  const usersRes = await fetch(`${BASE_URL}/api/settings/users`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const users = await usersRes.json();
  const superAdmin = users.find(u => u.id === 'usr_1');
  assert.equal(superAdmin.name, 'Super Administrator');

  // Prove flaw: targetUser?.name ('Super Administrator') === user.email ('admin@mohsinco.com')
  const willBlock = (superAdmin.name === me.email);
  assert.equal(willBlock, false, 'BUG PROVEN: Name does not match email, self-deletion check fails!');
});

test('ADVERSARIAL 4: Negative Shift Duration Math on Live Server', async () => {
  if (!authToken) authToken = await login();

  // Create an employee for testing
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Overnight Worker Test',
      email: `overnight_${Date.now()}@test.com`,
      phone: '03001234567',
      cnic: '42101-9999999-1',
      department: 'Operations',
      designation: 'Staff',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 40000,
      shift_id: 'shift_gen'
    })
  });
  const emp = await empRes.json();

  // Perform an attendance override with night shift: check-in 20:00, check-out 04:00
  const overrideRes = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: '2026-08-15',
      check_in_time: '20:00:00',
      check_out_time: '04:00:00',
      status: 'present',
      reason: 'Overnight shift verification'
    })
  });
  assert.equal(overrideRes.status, 200);

  // Fetch the attendance record from the live server
  const attRes = await fetch(`${BASE_URL}/api/attendance?employee_id=${emp.id}&date=2026-08-15`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const attList = await attRes.json();
  const att = attList.find(a => a.date === '2026-08-15');

  assert.ok(att, 'Attendance record should be created');
  assert.equal(att.hours_worked, 0, 'PROVEN DEFECT: Overnight shift 20:00 to 04:00 stored as 0.0 hours worked!');

  // Cleanup employee
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
});

test('ADVERSARIAL 5: Adjustment Post Month-End Lost in Live Payroll Calculation', async () => {
  if (!authToken) authToken = await login();

  // Create temporary employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Adjustment Test Worker',
      email: `adj_${Date.now()}@test.com`,
      phone: '03001234568',
      cnic: '42101-8888888-1',
      department: 'Operations',
      designation: 'Staff',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 60000,
      shift_id: 'shift_gen'
    })
  });
  const emp = await empRes.json();

  // Today is August 31, 2026. Add an adjustment for July 2026 (2026-07)
  const adjRes = await fetch(`${BASE_URL}/api/payroll/adjustments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      month: '2026-07',
      type: 'bonus',
      amount: 7500,
      description: 'July Retroactive Bonus'
    })
  });
  assert.equal(adjRes.status, 200);

  // Trigger calculation for July 2026 on live server
  const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: '2026-07' })
  });
  const records = await calcRes.json();
  const empRecord = records.find(r => r.employee_id === emp.id);

  assert.ok(empRecord, 'July payroll record should exist');
  assert.equal(empRecord.total_bonuses, 0, 'PROVEN CRITICAL DEFECT: July bonus is 0 because adjustment was created in August!');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
});
