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
  userId: 'usr_p1_verifier',
  email: 'p1_verifier@mohsinco.com',
  role: 'super_admin',
  permissions: {
    employees: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true, mark: true, override: true, manage_shifts: true },
    payroll: { view: true, calculate: true, approve: true, adjustments: true },
    reports: { view: true, export: true },
    settings: { company_setup: true, user_roles: true, system_backup: true }
  }
};

const validToken = jwt.sign(adminPayload, CONFIGURED_JWT_SECRET, { expiresIn: '1h' });
const expiredToken = jwt.sign(adminPayload, CONFIGURED_JWT_SECRET, { expiresIn: '-10m' });

test('P1 INDEPENDENT VERIFICATION RELEASE GATE', async (t) => {

  // =========================================================================
  // P1-01: DEFECT-03 / DEFECT-ADV-08 Metrics Authentication & Data Disclosure
  // =========================================================================
  await t.test('P1-01 Verification: /api/dashboard/metrics authentication enforcement', async (st) => {
    await st.test('1. Unauthenticated GET returns HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/dashboard/metrics`);
      assert.equal(res.status, 401, 'Unauthenticated request must be rejected with 401');
      const body = await res.json();
      assert.equal(body.error, 'Authentication required');
    });

    await st.test('2. Expired JWT returns HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
        headers: { 'Authorization': `Bearer ${expiredToken}` }
      });
      assert.equal(res.status, 401, 'Expired token must return 401');
    });

    await st.test('3. Malformed auth header returns HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
        headers: { 'Authorization': 'Bearer bogus.token.value' }
      });
      assert.equal(res.status, 401, 'Bogus token must return 401');
    });

    await st.test('4. Valid Bearer token returns HTTP 200 and authorized metrics object', async () => {
      const res = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });
      assert.equal(res.status, 200, 'Valid token must return 200');
      const data = await res.json();
      assert.ok('total_employees' in data, 'Must have total_employees');
      assert.ok('present_today' in data, 'Must have present_today');
      assert.ok('today_payroll_accrual' in data, 'Must have today_payroll_accrual');
      assert.ok('monthly_payroll_estimate' in data, 'Must have monthly_payroll_estimate');
    });
  });

  // =========================================================================
  // P1-02: DEFECT-ADV-03 Time Format Validation in attendanceOverrideSchema
  // =========================================================================
  await t.test('P1-02 Verification: Time format schema validation rejects corruption', async (st) => {
    const invalidInputs = [
      'not-a-time',
      '24:00',
      '25:00',
      '12:60',
      '12:3',
      'abc:def',
      '99:99:99',
      '12:00:60'
    ];

    for (const badTime of invalidInputs) {
      await st.test(`Reject malformed time "${badTime}" with HTTP 400`, async () => {
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
            reason: 'Testing malformed time validation'
          })
        });
        assert.equal(res.status, 400, `Time "${badTime}" must be rejected with HTTP 400`);
      });
    }

    await st.test('Valid time formats HH:MM and HH:MM:SS are accepted with HTTP 200', async () => {
      const empsRes = await fetch(`${BASE_URL}/api/employees`, {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });
      const emps = await empsRes.json();
      const testEmpId = emps[0].id;

      // HH:MM
      const res1 = await fetch(`${BASE_URL}/api/attendance/override`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          employee_id: testEmpId,
          date: '2026-08-27',
          check_in_time: '08:30',
          check_out_time: '17:00',
          status: 'present',
          reason: 'Valid HH:MM test'
        })
      });
      assert.equal(res1.status, 200);

      // Verify hours_worked is not null or NaN
      const attRes = await fetch(`${BASE_URL}/api/attendance?employee_id=${testEmpId}&date=2026-08-27`, {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });
      const records = await attRes.json();
      const rec = records.find(r => r.date === '2026-08-27');
      assert.ok(rec);
      assert.equal(typeof rec.hours_worked, 'number');
      assert.equal(rec.hours_worked, 8.5);
    });
  });

  // =========================================================================
  // P1-03: DEFECT-02 / DEFECT-ADV-07 Overnight Shift Duration Rollover
  // =========================================================================
  await t.test('P1-03 Verification: Overnight shift duration calculation with midnight rollover', async (st) => {
    const empsRes = await fetch(`${BASE_URL}/api/employees`, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    const emps = await empsRes.json();
    const testEmpId = emps[0].id;

    const shiftCases = [
      { inTime: '20:00:00', outTime: '04:00:00', expected: 8.0, desc: 'Original Defect: 20:00 to 04:00' },
      { inTime: '22:00:00', outTime: '06:30:00', expected: 8.5, desc: 'Overnight: 22:00 to 06:30' },
      { inTime: '23:30:00', outTime: '07:45:00', expected: 8.3, desc: 'Overnight: 23:30 to 07:45' },
      { inTime: '09:00:00', outTime: '17:00:00', expected: 8.0, desc: 'Daytime Normal: 09:00 to 17:00' },
      { inTime: '18:00:00', outTime: '02:00:00', expected: 8.0, desc: 'Evening to Night: 18:00 to 02:00' }
    ];

    for (let i = 0; i < shiftCases.length; i++) {
      const sc = shiftCases[i];
      const d = `2026-07-${String(10 + i).padStart(2, '0')}`;
      await st.test(`${sc.desc} yields ${sc.expected} hours`, async () => {
        const res = await fetch(`${BASE_URL}/api/attendance/override`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${validToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            employee_id: testEmpId,
            date: d,
            check_in_time: sc.inTime,
            check_out_time: sc.outTime,
            status: 'present',
            reason: sc.desc
          })
        });
        assert.equal(res.status, 200);

        const attRes = await fetch(`${BASE_URL}/api/attendance?employee_id=${testEmpId}&date=${d}`, {
          headers: { 'Authorization': `Bearer ${validToken}` }
        });
        const records = await attRes.json();
        const rec = records.find(r => r.date === d);
        assert.ok(rec, 'Attendance record exists');
        assert.equal(rec.hours_worked, sc.expected, `Expected ${sc.expected} hours worked, got ${rec.hours_worked}`);
      });
    }
  });

  // =========================================================================
  // P1-04: DEFECT-ADV-05 Inactive Employee Inclusion in Worked Period Payroll
  // =========================================================================
  await t.test('P1-04 Verification: Resigned/inactive employee payroll inclusion & period isolation', async (st) => {
    // 1. Create temporary employee
    const empRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Independent Verification Inactive Emp',
        email: `indep_p1_${Date.now()}@mohsinco.com`,
        phone: '03007771122',
        cnic: '42101-7777777-1',
        department: 'Operations',
        designation: 'Field Operator',
        joining_date: '2026-01-01',
        employment_type: 'monthly_salary',
        base_salary: 80000,
        shift_id: 'shift_gen'
      })
    });
    assert.equal(empRes.status, 200);
    const emp = await empRes.json();

    // 2. Add 3 worked days in January 2026
    for (let day = 1; day <= 3; day++) {
      const d = `2026-01-0${day}`;
      const att = await fetch(`${BASE_URL}/api/attendance/override`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          employee_id: emp.id,
          date: d,
          check_in_time: '09:00:00',
          check_out_time: '17:00:00',
          status: 'present',
          reason: 'Pre-resignation work days'
        })
      });
      assert.equal(att.status, 200);
    }

    // 3. Mark employee inactive (e.g. employee resigned Jan 10)
    const upd = await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'inactive' })
    });
    assert.equal(upd.status, 200);

    // 4. Calculate January 2026 payroll -> inactive employee MUST appear with 3 days present
    await st.test('Inactive employee is included in January 2026 payroll calculation', async () => {
      const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ month: '2026-01' })
      });
      assert.equal(calcRes.status, 200);
      const records = await calcRes.json();
      const rec = records.find(r => r.employee_id === emp.id);
      assert.ok(rec, 'Resigned employee must be included in January payroll calculation');
      assert.equal(rec.days_present, 3, 'Must have 3 days present');
      assert.ok(rec.net_payout > 0, 'Net payout must be positive');
    });

    // 5. Calculate February 2026 payroll -> inactive employee MUST NOT appear (no phantom payroll)
    await st.test('Inactive employee with zero activity in February is NOT included in February payroll', async () => {
      const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ month: '2026-02' })
      });
      assert.equal(calcRes.status, 200);
      const records = await calcRes.json();
      const rec = records.find(r => r.employee_id === emp.id);
      assert.equal(rec, undefined, 'Inactive employee with zero activity in February must NOT appear in February payroll');
    });

    // 6. Cleanup
    await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
  });
});
