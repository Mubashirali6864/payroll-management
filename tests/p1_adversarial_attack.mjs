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

const adminPayload = {
  userId: 'usr_1',
  email: 'admin@mohsinco.com',
  role: 'super_admin',
  permissions: {
    employees: { view: true },
    attendance: { view: true },
    payroll: { view: true },
    reports: { view: true },
    settings: { company_setup: true }
  }
};

const validToken = jwt.sign(adminPayload, CONFIGURED_JWT_SECRET, { expiresIn: '1h' });

test('ADVERSARIAL ATTACK P1-01: Metrics endpoint authentication bypass attempts', async (t) => {
  await t.test('1. Direct unauthenticated curl without headers returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/metrics`);
    assert.equal(res.status, 401);
  });

  await t.test('2. Empty Authorization header returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
      headers: { 'Authorization': '' }
    });
    assert.equal(res.status, 401);
  });

  await t.test('3. Malformed Bearer header returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
      headers: { 'Authorization': 'Bearer not-a-valid-token' }
    });
    assert.equal(res.status, 401);
  });

  await t.test('4. alg: none forged token returns 401', async () => {
    const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(adminPayload)).toString('base64url');
    const res = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
      headers: { 'Authorization': `Bearer ${h}.${p}.` }
    });
    assert.equal(res.status, 401);
  });

  await t.test('5. Valid token returns 200 with full metrics payload', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data.total_employees === 'number');
    assert.ok(typeof data.present_today === 'number');
    assert.ok(typeof data.today_payroll_accrual === 'number');
    assert.ok(typeof data.monthly_payroll_estimate === 'number');
  });
});

test('ADVERSARIAL ATTACK P1-02: Malformed time boundary inputs to /api/attendance/override', async (t) => {
  const malformedTimes = ['24:00', '25:00', '12:60', '12:3', 'abc:def', '99:99:99', '12:00:60'];
  for (const badTime of malformedTimes) {
    await t.test(`Reject malformed time "${badTime}" with 400`, async () => {
      const res = await fetch(`${BASE_URL}/api/attendance/override`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          employee_id: 'emp_1',
          date: '2026-08-25',
          check_in_time: badTime,
          check_out_time: '17:00:00',
          status: 'present',
          reason: 'Fuzzing time inputs'
        })
      });
      assert.equal(res.status, 400, `Time "${badTime}" must return 400`);
    });
  }

  const empsRes = await fetch(`${BASE_URL}/api/employees`, {
    headers: { 'Authorization': `Bearer ${validToken}` }
  });
  const emps = await empsRes.json();
  const testEmpId = emps[0]?.id || 'emp_001';

  await t.test('Accept valid HH:MM format ("08:45")', async () => {
    const res = await fetch(`${BASE_URL}/api/attendance/override`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: testEmpId,
        date: '2026-08-25',
        check_in_time: '08:45',
        check_out_time: '17:15',
        status: 'present',
        reason: 'Valid HH:MM time test'
      })
    });
    assert.equal(res.status, 200);
  });

  await t.test('Accept valid HH:MM:SS format ("08:45:30")', async () => {
    const res = await fetch(`${BASE_URL}/api/attendance/override`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: testEmpId,
        date: '2026-08-25',
        check_in_time: '08:45:30',
        check_out_time: '17:15:30',
        status: 'present',
        reason: 'Valid HH:MM:SS time test'
      })
    });
    assert.equal(res.status, 200);
  });
});

test('ADVERSARIAL ATTACK P1-03: Overnight shift duration rollover permutations', async (t) => {
  const empsRes = await fetch(`${BASE_URL}/api/employees`, {
    headers: { 'Authorization': `Bearer ${validToken}` }
  });
  const emps = await empsRes.json();
  const testEmpId = emps[0].id;

  const testCases = [
    { inTime: '22:00:00', outTime: '06:30:00', expectedHours: 8.5, desc: '22:00 to 06:30 overnight shift' },
    { inTime: '23:30:00', outTime: '07:45:00', expectedHours: 8.3, desc: '23:30 to 07:45 overnight shift' },
    { inTime: '09:00:00', outTime: '18:00:00', expectedHours: 9.0, desc: '09:00 to 18:00 normal daytime shift' },
    { inTime: '18:00:00', outTime: '02:00:00', expectedHours: 8.0, desc: '18:00 to 02:00 early night shift' }
  ];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const testDate = `2026-08-${String(10 + i).padStart(2, '0')}`;
    await t.test(tc.desc, async () => {
      const res = await fetch(`${BASE_URL}/api/attendance/override`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          employee_id: testEmpId,
          date: testDate,
          check_in_time: tc.inTime,
          check_out_time: tc.outTime,
          status: 'present',
          reason: tc.desc
        })
      });
      assert.equal(res.status, 200);

      const attRes = await fetch(`${BASE_URL}/api/attendance?employee_id=${testEmpId}&date=${testDate}`, {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });
      const records = await attRes.json();
      const rec = records.find(r => r.date === testDate);
      assert.ok(rec);
      assert.equal(rec.hours_worked, tc.expectedHours, `${tc.desc} must equal ${tc.expectedHours} hours`);
    });
  }
});

test('ADVERSARIAL ATTACK P1-04: Inactive employee cross-month isolation & phantom payroll prevention', async (t) => {
  const activeMonth = '2026-03';
  const inactiveMonth = '2026-04';

  // 1. Create employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Isolation Test Inactive Employee',
      email: `iso_${Date.now()}@mohsinco.com`,
      phone: '03009998877',
      cnic: '42101-5555555-1',
      department: 'HR',
      designation: 'Recruiter',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 75000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Add attendance shifts ONLY in activeMonth (March 2026)
  await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: '2026-03-15',
      check_in_time: '09:00:00',
      check_out_time: '17:00:00',
      status: 'present',
      reason: 'Worked before resignation'
    })
  });

  // 3. Mark employee inactive
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'inactive' })
  });

  // 4. Test: In activeMonth (March 2026), employee MUST be included
  await t.test('Inactive employee with shifts in March MUST be included in March payroll', async () => {
    const res = await fetch(`${BASE_URL}/api/payroll/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ month: activeMonth })
    });
    assert.equal(res.status, 200);
    const records = await res.json();
    const found = records.find(r => r.employee_id === emp.id);
    assert.ok(found, 'Employee must be present in March calculation');
    assert.equal(found.days_present, 1);
  });

  // 5. Test: In inactiveMonth (April 2026), employee MUST NOT be included (no shifts, no phantom payroll)
  await t.test('Inactive employee with NO shifts in April MUST NOT be included in April payroll', async () => {
    const res = await fetch(`${BASE_URL}/api/payroll/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ month: inactiveMonth })
    });
    assert.equal(res.status, 200);
    const records = await res.json();
    const found = records.find(r => r.employee_id === emp.id);
    assert.equal(found, undefined, 'Inactive employee with zero April activity must NOT appear in April payroll');
  });

  // 6. Test: Add severance adjustment in April for inactive employee, MUST appear in April
  await t.test('Inactive employee receiving severance adjustment in April MUST appear in April payroll', async () => {
    await fetch(`${BASE_URL}/api/payroll/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: emp.id,
        month: inactiveMonth,
        type: 'bonus',
        amount: 25000,
        description: 'Severance payment'
      })
    });

    const res = await fetch(`${BASE_URL}/api/payroll/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ month: inactiveMonth })
    });
    assert.equal(res.status, 200);
    const records = await res.json();
    const found = records.find(r => r.employee_id === emp.id);
    assert.ok(found, 'Inactive employee with April adjustment must appear in April payroll');
    assert.equal(found.total_bonuses, 25000);
  });

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${validToken}` }
  });
});
