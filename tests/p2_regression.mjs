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
  userId: 'usr_p2_tester',
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

test('P2-01 (DEFECT-09): half_day attendance MUST be paid at 50% rate for daily wage earners', async () => {
  const targetMonth = '2026-06';

  // 1. Create a daily-wage employee with base_salary (daily rate) = 3000
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'HalfDay Daily Worker',
      email: `hd_worker_${Date.now()}@mohsinco.com`,
      phone: '03001112233',
      cnic: '42101-1112233-1',
      department: 'Operations',
      designation: 'Helper',
      joining_date: '2026-01-01',
      employment_type: 'daily_wage',
      base_salary: 3000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Mark exactly 1 half_day on 2026-06-01
  const attRes = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: '2026-06-01',
      check_in_time: '09:00:00',
      check_out_time: '13:00:00',
      status: 'half_day',
      reason: 'Half-day shift worked'
    })
  });
  assert.equal(attRes.status, 200);

  // 3. Calculate payroll for 2026-06
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
  const rec = records.find(r => r.employee_id === emp.id);
  assert.ok(rec, 'Payroll record exists');

  // Daily rate is 3000. 1 half day = 0.5 * 3000 = 1500 PKR.
  assert.equal(rec.gross_earnings, 1500, 'Gross earnings for 1 half-day must be 50% of daily rate (1500 PKR)');
  assert.equal(rec.net_payout, 1500, 'Net payout must be 1500 PKR');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});

test('P2-02 (DEFECT-05): Daily wage earner working on scheduled off-day MUST be credited and paid', async () => {
  const targetMonth = '2026-06';
  const offSunday = '2026-06-07';

  // 1. Create a daily-wage employee with custom_off_dates including 2026-06-07
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Sunday Worker',
      email: `sun_worker_${Date.now()}@mohsinco.com`,
      phone: '03009988776',
      cnic: '42101-9988776-1',
      department: 'Maintenance',
      designation: 'Electrician',
      joining_date: '2026-01-01',
      employment_type: 'daily_wage',
      base_salary: 2500,
      custom_off_dates: offSunday,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Worker comes in on Sunday 2026-06-07 for an emergency shift
  const attRes = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: offSunday,
      check_in_time: '09:00:00',
      check_out_time: '17:00:00',
      status: 'present',
      reason: 'Emergency maintenance shift on Sunday off-day'
    })
  });
  assert.equal(attRes.status, 200);

  // 3. Calculate payroll
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
  const rec = records.find(r => r.employee_id === emp.id);
  assert.ok(rec, 'Payroll record exists');

  // Must credit 1 day worked and 2500 PKR
  assert.equal(rec.days_present, 1, 'Sunday worked shift must increment days_present to 1');
  assert.equal(rec.gross_earnings, 2500, 'Gross earnings must include Sunday wage of 2500 PKR');
  assert.equal(rec.net_payout, 2500, 'Net payout must equal 2500 PKR');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});

test('P2-03 (DEFECT-06): Future month payroll calculation MUST NOT award 100% full salary for 0 days worked', async () => {
  const futureMonth = '2099-01';

  // 1. Create a salaried employee with base_salary = 80,000 PKR
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Future Month Salaried Worker',
      email: `fut_worker_${Date.now()}@mohsinco.com`,
      phone: '03003332211',
      cnic: '42101-3332211-1',
      department: 'Finance',
      designation: 'Accountant',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 80000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Calculate payroll for future month 2099-01 (0 days elapsed, 0 days worked)
  const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: futureMonth })
  });
  assert.equal(calcRes.status, 200);
  const records = await calcRes.json();
  const rec = records.find(r => r.employee_id === emp.id);
  assert.ok(rec, 'Record exists');

  // Must not pay 80,000 for unworked future month!
  assert.equal(rec.gross_earnings, 0, 'Future month with 0 days elapsed must have gross_earnings = 0');
  assert.equal(rec.net_payout, 0, 'Future month with 0 days elapsed must have net_payout = 0');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});

test('P2-04 (DEFECT-04): Administrator self-deletion MUST be blocked with HTTP 400', async () => {
  // 1. Fetch current admin user
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(meRes.status, 200);
  const me = await meRes.json();
  const myId = me.id || me.userId;
  const myEmail = me.email;

  // 2. Attempt to delete own account by ID
  const delByIdRes = await fetch(`${BASE_URL}/api/settings/users/${myId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(delByIdRes.status, 400, 'Deleting own account by ID must return HTTP 400');
  const errBody = await delByIdRes.json();
  assert.equal(errBody.error, 'Cannot delete your own account');

  // 3. Create a temporary user to verify deleting ANOTHER account succeeds
  const createRes = await fetch(`${BASE_URL}/api/settings/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Temp Deletable User',
      email: `temp_del_${Date.now()}@mohsinco.com`,
      password: 'password123',
      role: 'hr_admin',
      permissions: { employees: { view: true } }
    })
  });
  assert.equal(createRes.status, 200);
  const tempUser = await createRes.json();

  // 4. Deleting another account must return 200
  const delOtherRes = await fetch(`${BASE_URL}/api/settings/users/${tempUser.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(delOtherRes.status, 200, 'Deleting another user must return HTTP 200');

  // 5. Deleting nonexistent user must return HTTP 404
  const delNonexistent = await fetch(`${BASE_URL}/api/settings/users/nonexistent_user_id`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(delNonexistent.status, 404, 'Deleting nonexistent user must return HTTP 404');
});

test('P2-05 (DEFECT-08): Print templates and document generation MUST sanitize XSS payloads', async () => {
  // 1. Dynamic import printUtils
  const { escapeHtml, sanitizeHtml } = await import('../mohsin-&-co-payroll-&-attendance/src/utils/printUtils.ts');

  // Test escapeHtml entity encoding
  const maliciousStr = '<script>alert("xss")</script>&<img src=x onerror=\'steal()\'>';
  const escaped = escapeHtml(maliciousStr);

  assert.ok(!escaped.includes('<script>'), 'Must not contain raw <script>');
  assert.ok(!escaped.includes('</script>'), 'Must not contain raw </script>');
  assert.ok(!escaped.includes('<img'), 'Must not contain raw <img');
  assert.ok(escaped.includes('&lt;script&gt;'), 'Must entity-encode < and >');
  assert.ok(escaped.includes('&quot;'), 'Must entity-encode double quotes');
  assert.ok(escaped.includes('&#39;'), 'Must entity-encode single quotes');
  assert.ok(escaped.includes('&amp;'), 'Must entity-encode ampersand');

  // Test sanitizeHtml event handler stripping
  const rawHtmlDoc = `<div class="brand"><img src="x" onerror="alert(document.cookie)"><span>Hello</span><script>evil()</script></div>`;
  const sanitized = sanitizeHtml(rawHtmlDoc);

  assert.ok(!sanitized.includes('onerror'), 'Must strip onerror attributes');
  assert.ok(!sanitized.includes('<script>'), 'Must strip <script> blocks');
  assert.ok(!sanitized.includes('evil()'), 'Must strip script contents');
  assert.ok(sanitized.includes('<span>Hello</span>'), 'Must preserve safe markup');
});

test('P2-06 (DEFECT-07): Rapid biometric double-punch MUST be debounced within 5 minutes', async () => {
  const punchDate = '2026-08-18';
  const empCode = `7788_${Date.now().toString().slice(-4)}`;

  // 1. Create employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_code: `EMP-${empCode}`,
      name: 'Biometric Test Worker',
      email: `bio_${Date.now()}@mohsinco.com`,
      phone: '03001234567',
      cnic: '42101-7788990-1',
      department: 'Operations',
      designation: 'Operator',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 50000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Send initial Check-In punch at 09:00:00
  const punch1Body = `${empCode}\t${punchDate} 09:00:00\t0\t0\t0\t0\n`;
  const punch1Res = await fetch(`${BASE_URL}/iclock/cdata?SN=BIO_TEST_DEV&table=ATTLOG`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: punch1Body
  });
  assert.equal(punch1Res.status, 200);

  // 3. Send accidental double-punch 15 seconds later at 09:00:15
  const punch2Body = `${empCode}\t${punchDate} 09:00:15\t0\t0\t0\t0\n`;
  const punch2Res = await fetch(`${BASE_URL}/iclock/cdata?SN=BIO_TEST_DEV&table=ATTLOG`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: punch2Body
  });
  assert.equal(punch2Res.status, 200);

  // 4. Fetch attendance records for this employee on this date
  const attListRes = await fetch(`${BASE_URL}/api/attendance?date=${punchDate}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(attListRes.status, 200);
  const attList = await attListRes.json();
  const att = attList.find(a => a.employee_id === emp.id);
  assert.ok(att, 'Attendance record must exist');

  // Before fix: check_out_time is set to '09:00:15'
  // After fix: check_out_time MUST remain null (debounced)
  assert.equal(att.check_in_time, '09:00:00', 'Check-in time must be 09:00:00');
  assert.equal(att.check_out_time, null, 'Second punch within 15 seconds MUST be debounced (check_out_time remains null)');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});

test('P2-07 (DEFECT-ADV-04): Safe HTTP GET /api/payroll/records MUST NOT mutate database or regenerate draft timestamps', async () => {
  const testMonth = '2026-07';

  // 1. Explicitly calculate payroll for testMonth
  const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: testMonth })
  });
  assert.equal(calcRes.status, 200);
  const initialRecords = await calcRes.json();
  assert.ok(initialRecords.length > 0);
  const originalTimestamp = initialRecords[0].generated_at;

  // Wait 100ms so that if recalculation occurs, timestamp would differ
  await new Promise(r => setTimeout(r, 100));

  // 2. Perform safe HTTP GET request
  const getRes = await fetch(`${BASE_URL}/api/payroll/records?month=${testMonth}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(getRes.status, 200);
  const readRecords = await getRes.json();
  const readTimestamp = readRecords[0].generated_at;

  // Before fix: GET calls calculatePayrollForMonth, which rewrites generated_at = new Date().toISOString()
  // After fix: GET is pure read-only, original timestamp is preserved exactly
  assert.equal(readTimestamp, originalTimestamp, 'GET /api/payroll/records must NOT recalculate or mutate generated_at timestamp');
});
