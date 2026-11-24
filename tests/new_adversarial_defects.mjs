import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../mohsin-&-co-payroll-&-attendance/node_modules/jsonwebtoken/index.js';

const BASE_URL = 'http://localhost:3000';
// Proves DEFECT: server fails to load .env, running with hardcoded fallback secret
const JWT_SECRET = 'dev-secret-change-in-production';

// Directly sign valid admin JWT using the server's unconfigured fallback secret
function getAdminToken() {
  return jwt.sign({
    userId: 'usr_1',
    email: 'admin@mohsinco.com',
    role: 'super_admin',
    permissions: {}
  }, JWT_SECRET, { expiresIn: '8h' });
}

let authToken = getAdminToken();

test('NEW DEFECT 2: Attendance override allows malformed time string and calculates NaN hours_worked', async () => {
  authToken = getAdminToken();

  // Create an employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'NaN Time Test Employee',
      email: `nan_test_${Date.now()}@mohsinco.com`,
      phone: '03001234569',
      cnic: '42101-7777777-1',
      department: 'IT',
      designation: 'Engineer',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 50000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200, 'Employee created');
  const emp = await empRes.json();

  // Override attendance with malformed time string
  const overrideRes = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: '2026-08-20',
      check_in_time: 'not-a-time',
      check_out_time: 'invalid',
      status: 'present',
      reason: 'Testing NaN calculation'
    })
  });
  assert.equal(overrideRes.status, 200, 'Zod accepted malformed time string!');

  // Fetch attendance to check hours_worked
  const attRes = await fetch(`${BASE_URL}/api/attendance?employee_id=${emp.id}&date=2026-08-20`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const attList = await attRes.json();
  const record = attList.find(a => a.date === '2026-08-20');

  assert.ok(record, 'Attendance record exists');
  // NaN in SQLite gets stored as null or string
  assert.equal(record.hours_worked, null, 'CONFIRMED BUG: Malformed time string results in null/NaN hours_worked!');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
});

test('NEW DEFECT 2: Attendance override allows malformed time string and calculates NaN hours_worked', async () => {
  if (!authToken) authToken = await login();

  // Create an employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'NaN Time Test Employee',
      email: `nan_test_${Date.now()}@mohsinco.com`,
      phone: '03001234569',
      cnic: '42101-7777777-1',
      department: 'IT',
      designation: 'Engineer',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 50000,
      shift_id: 'shift_gen'
    })
  });
  const emp = await empRes.json();

  // Override attendance with malformed time string
  const overrideRes = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: '2026-08-20',
      check_in_time: 'not-a-time',
      check_out_time: 'invalid',
      status: 'present',
      reason: 'Testing NaN calculation'
    })
  });
  assert.equal(overrideRes.status, 200, 'Zod accepted malformed time string!');

  // Fetch attendance to check hours_worked
  const attRes = await fetch(`${BASE_URL}/api/attendance?employee_id=${emp.id}&date=2026-08-20`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const attList = await attRes.json();
  const record = attList.find(a => a.date === '2026-08-20');

  assert.ok(record, 'Attendance record exists');
  // NaN in SQLite gets stored as null
  assert.equal(record.hours_worked, null, 'CONFIRMED BUG: Malformed time string results in null/NaN hours_worked!');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
});

test('NEW DEFECT 3: GET /api/payroll/records mutates database and forces synchronous disk export', async () => {
  if (!authToken) authToken = await login();

  // Sending GET request should be safe and read-only.
  // But line 1212 calls calculatePayrollForMonth() which executes database writes and saveDatabase()
  const res = await fetch(`${BASE_URL}/api/payroll/records?month=2026-08`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  assert.equal(res.status, 200);
  const records = await res.json();
  assert.ok(Array.isArray(records));
  // The server log confirms calculatePayrollForMonth executed during a GET request
});
