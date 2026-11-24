import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../mohsin-&-co-payroll-&-attendance/node_modules/jsonwebtoken/index.js';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const envPath = path.resolve('mohsin-&-co-payroll-&-attendance/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envSecretMatch = envContent.match(/JWT_SECRET\s*=\s*(.+)/);
const CONFIGURED_JWT_SECRET = envSecretMatch ? envSecretMatch[1].trim() : '';

const adminToken = jwt.sign({
  userId: 'usr_1',
  email: 'admin@mohsinco.com',
  role: 'super_admin',
  permissions: {
    employees: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true, mark: true, override: true, manage_shifts: true },
    payroll: { view: true, calculate: true, approve: true, adjustments: true },
    reports: { view: true, export: true },
    settings: { company_setup: true, user_roles: true, system_backup: true }
  }
}, CONFIGURED_JWT_SECRET, { expiresIn: '1h' });

test('P1-01 (DEFECT-03): /api/dashboard/metrics MUST require authentication', async () => {
  // 1. Unauthenticated request MUST return 401
  const unauthRes = await fetch(`${BASE_URL}/api/dashboard/metrics`);
  assert.equal(unauthRes.status, 401, 'Unauthenticated request to /api/dashboard/metrics must return 401');

  // 2. Authenticated request MUST return 200
  const authRes = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(authRes.status, 200, 'Authenticated request to /api/dashboard/metrics must return 200');
  const metrics = await authRes.json();
  assert.ok('total_employees' in metrics, 'Metrics must contain total_employees');
});

test('P1-02 (DEFECT-ADV-03): attendanceOverrideSchema MUST reject malformed time strings with 400', async () => {
  // 1. Submit override with malformed check_in_time
  const res = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: 'emp_1',
      date: '2026-08-25',
      check_in_time: 'not-a-time',
      check_out_time: '17:00:00',
      status: 'present',
      reason: 'Testing malformed time'
    })
  });
  assert.equal(res.status, 400, 'Malformed check_in_time must return HTTP 400 Bad Request');
});

test('P1-03 (DEFECT-02): Overnight shift duration MUST calculate 8.0 hours instead of floored 0.0', async () => {
  // Fetch existing employee
  const empsRes = await fetch(`${BASE_URL}/api/employees`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const emps = await empsRes.json();
  const testEmpId = emps[0].id;

  // 1. Submit attendance override with overnight shift (20:00 to 04:00)
  const overrideRes = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: testEmpId,
      date: '2026-08-26',
      check_in_time: '20:00:00',
      check_out_time: '04:00:00',
      status: 'present',
      reason: 'Overnight shift test'
    })
  });
  assert.equal(overrideRes.status, 200, 'Override saved');

  // 2. Fetch record and verify hours_worked
  const attRes = await fetch(`${BASE_URL}/api/attendance?employee_id=${testEmpId}&date=2026-08-26`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(attRes.status, 200);
  const records = await attRes.json();
  const record = records.find(r => r.date === '2026-08-26');
  assert.ok(record, 'Record exists');
  assert.equal(record.hours_worked, 8.0, 'Overnight shift 20:00 to 04:00 must equal 8.0 hours');
});

test('P1-04 (DEFECT-ADV-05): Resigned/inactive employee with worked shifts MUST be included in payroll calculation', async () => {
  const targetMonth = '2026-05';

  // 1. Create a test employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Resigned Test Employee',
      email: `resigned_${Date.now()}@mohsinco.com`,
      phone: '03001239988',
      cnic: '42101-8888888-1',
      department: 'Operations',
      designation: 'Technician',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 60000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Add attendance shifts in target month (May 2026)
  for (let day = 1; day <= 5; day++) {
    const dateStr = `2026-05-0${day}`;
    const attRes = await fetch(`${BASE_URL}/api/attendance/override`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: emp.id,
        date: dateStr,
        check_in_time: '09:00:00',
        check_out_time: '17:00:00',
        status: 'present',
        reason: 'Shift worked before resignation'
      })
    });
    assert.equal(attRes.status, 200);
  }

  // 3. Mark employee as 'inactive' (e.g. employee resigned on May 20)
  const updateRes = await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'inactive'
    })
  });
  assert.equal(updateRes.status, 200);

  // 4. Calculate payroll for May 2026
  const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: targetMonth })
  });
  assert.equal(calcRes.status, 200);
  const records = await calcRes.json();

  // 5. Verify the inactive employee IS present in the payroll calculation
  const empRecord = records.find(r => r.employee_id === emp.id);
  assert.ok(empRecord, 'Resigned employee with worked shifts must be included in calculated payroll');
  assert.equal(empRecord.days_present, 5, 'Must record 5 days present');
  assert.ok(empRecord.net_payout > 0, 'Net payout must be positive for worked days');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});
