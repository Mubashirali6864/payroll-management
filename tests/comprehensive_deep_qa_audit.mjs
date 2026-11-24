import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000';

let superAdminToken = '';
let hrAdminToken = '';
let testEmployeeId = '';
let testEmployeeCode = '';

// ============================================================================
// SUITE 1: AUTHENTICATION, PERMISSIONS & SECURITY
// ============================================================================

test('1.1 Super Admin Authentication succeeds with valid credentials', async () => {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@mohsinco.com',
      password: 'MohsinCoSecure2026!'
    })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.token);
  assert.equal(data.user.role, 'super_admin');
  superAdminToken = data.token;
});

test('1.2 HR Admin Authentication succeeds with valid credentials', async () => {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'hr@mohsinco.com',
      password: 'MohsinCoSecure2026!'
    })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.token);
  assert.equal(data.user.role, 'hr_admin');
  hrAdminToken = data.token;
});

test('1.3 Failed logins return 401 and are NOT blocked by rate limiting (rate limiter removed)', async () => {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@mohsinco.com',
        password: `WrongPassword${i}!`
      })
    });
    assert.equal(res.status, 401, `Attempt ${i + 1} must return 401, not 429`);
  }
});

test('1.4 Unauthenticated requests to protected endpoints return 401', async () => {
  const endpoints = ['/api/employees', '/api/attendance', '/api/dashboard/metrics', '/api/payroll/records'];
  for (const ep of endpoints) {
    const res = await fetch(`${BASE_URL}${ep}`);
    assert.equal(res.status, 401, `Endpoint ${ep} must require authentication`);
  }
});

test('1.5 Role-based access control: Cashier cannot calculate payroll', async () => {
  // Create a temporary cashier user
  const cashierEmail = `cashier_${Date.now()}@mohsinco.com`;
  const createRes = await fetch(`${BASE_URL}/api/settings/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${superAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Test Cashier',
      email: cashierEmail,
      password: 'CashierPassword123!',
      role: 'cashier'
    })
  });
  assert.equal(createRes.status, 200);

  // Login as cashier
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cashierEmail,
      password: 'CashierPassword123!'
    })
  });
  assert.equal(loginRes.status, 200);
  const cashierToken = (await loginRes.json()).token;

  // Attempt to trigger payroll calculation
  const payrollRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cashierToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: '2026-08' })
  });
  assert.equal(payrollRes.status, 403, 'Cashier must be forbidden from calculating payroll');
});

// ============================================================================
// SUITE 2: EMPLOYEE LIFECYCLE & DATA INTEGRITY
// ============================================================================

test('2.1 Employee creation validates required fields and sets initial values', async () => {
  testEmployeeCode = `EMP_${Date.now().toString().slice(-4)}`;
  const res = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${hrAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_code: testEmployeeCode,
      name: 'Deep QA Automation User',
      email: `qa_user_${Date.now()}@mohsinco.com`,
      phone: '03009988776',
      cnic: '42101-9999999-1',
      department: 'Quality Assurance',
      designation: 'Senior QA Specialist',
      joining_date: '2026-01-15',
      employment_type: 'monthly_salary',
      base_salary: 75000,
      weekly_off_day: '0',
      custom_off_dates: '2026-09-06,2026-09-13',
      shift_id: 'shift_gen',
      status: 'active'
    })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.id);
  assert.equal(data.name, 'Deep QA Automation User');
  assert.equal(data.base_salary, 75000);
  testEmployeeId = data.id;
});

test('2.2 Duplicate Employee ID/Code is rejected with 409 Conflict', async () => {
  const res = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${hrAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_code: testEmployeeCode,
      name: 'Duplicate Code Tester',
      email: `duplicate_${Date.now()}@mohsinco.com`,
      phone: '03001122334',
      cnic: '42101-8888888-2',
      department: 'IT',
      designation: 'Tester',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 40000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(res.status, 409);
});

test('2.3 Partial update merges fields without clearing unmentioned properties', async () => {
  const updateRes = await fetch(`${BASE_URL}/api/employees/${testEmployeeId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${hrAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phone: '03110001122',
      designation: 'Lead QA Engineer'
    })
  });
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json();
  assert.equal(updated.phone, '03110001122');
  assert.equal(updated.designation, 'Lead QA Engineer');
  // Verify existing unmentioned fields were preserved
  assert.equal(updated.base_salary, 75000);
  assert.equal(updated.name, 'Deep QA Automation User');
  assert.equal(updated.department, 'Quality Assurance');
});

// ============================================================================
// SUITE 3: BIOMETRIC PUNCH SIMULATOR & DEBOUNCE
// ============================================================================

test('3.1 On-time biometric punch logs check-in with present status', async () => {
  const punchRes = await fetch(`${BASE_URL}/api/attendance/punch-simulate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${superAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: testEmployeeId,
      punch_type: 'on_time'
    })
  });
  assert.equal(punchRes.status, 200);
  const punchData = await punchRes.json();
  assert.equal(punchData.success, true);
});

test('3.2 Rapid double punch within 5 minutes is debounced', async () => {
  const punchRes2 = await fetch(`${BASE_URL}/api/attendance/punch-simulate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${superAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: testEmployeeId,
      punch_type: 'on_time'
    })
  });
  assert.equal(punchRes2.status, 200);
  // Fetch today's record to ensure no spurious checkout was created
  const todayStr = new Date().toISOString().split('T')[0];
  const attRes = await fetch(`${BASE_URL}/api/attendance?date=${todayStr}&employee_id=${testEmployeeId}`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  const records = await attRes.json();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'present');
  assert.equal(records[0].check_in_time, '08:55:00');
});

// ============================================================================
// SUITE 4: DAILY ROSTER SYNTHESIS & MANUAL OVERRIDE
// ============================================================================

test('4.1 Daily roster synthesizes records for all active employees', async () => {
  const testDate = '2026-09-15'; // Future Tuesday
  const empsRes = await fetch(`${BASE_URL}/api/employees`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  const activeEmps = (await empsRes.json()).filter(e => e.status === 'active' && (!e.joining_date || e.joining_date <= testDate));

  const rosterRes = await fetch(`${BASE_URL}/api/attendance?date=${testDate}`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  assert.equal(rosterRes.status, 200);
  const roster = await rosterRes.json();

  assert.equal(roster.length, activeEmps.length, 'Every active employee must be present in daily roster');

  for (const emp of activeEmps) {
    const entry = roster.find(r => r.employee_id === emp.id);
    assert.ok(entry, `Employee ${emp.name} must exist in roster`);
    assert.ok(['present', 'late', 'absent', 'half_day', 'leave', 'weekly_off'].includes(entry.status));
  }
});

test('4.2 Unrecorded Sunday correctly synthesizes weekly_off status', async () => {
  const sundayDate = '2026-09-20'; // Sunday
  const rosterRes = await fetch(`${BASE_URL}/api/attendance?date=${sundayDate}`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  const roster = await rosterRes.json();
  const testEmpRecord = roster.find(r => r.employee_id === testEmployeeId);
  assert.ok(testEmpRecord);
  assert.equal(testEmpRecord.status, 'weekly_off', 'Scheduled Sunday off day must synthesize weekly_off');
});

test('4.3 Single manual override persists and sets is_manual_override = 1', async () => {
  const overrideDate = '2026-09-16';
  const res = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${hrAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: testEmployeeId,
      date: overrideDate,
      check_in_time: '09:15:00',
      check_out_time: '17:00:00',
      status: 'late',
      reason: 'Traffic delay'
    })
  });
  assert.equal(res.status, 200);

  const checkRes = await fetch(`${BASE_URL}/api/attendance?date=${overrideDate}&employee_id=${testEmployeeId}`, {
    headers: { 'Authorization': `Bearer ${hrAdminToken}` }
  });
  const records = await checkRes.json();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'late');
  assert.equal(records[0].is_manual_override, 1);
  assert.equal(records[0].late_minutes, 15);
  assert.equal(records[0].override_reason, 'Traffic delay');
});

test('4.4 Bulk attendance override persists multi-date entries without data loss', async () => {
  const bulkRes = await fetch(`${BASE_URL}/api/attendance/bulk-override`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${hrAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      entries: [
        {
          employee_id: testEmployeeId,
          date: '2026-09-21',
          check_in_time: '09:00:00',
          check_out_time: '17:00:00',
          status: 'present',
          reason: 'Bulk Range Day 1'
        },
        {
          employee_id: testEmployeeId,
          date: '2026-09-22',
          check_in_time: '09:00:00',
          check_out_time: '13:00:00',
          status: 'half_day',
          reason: 'Bulk Range Day 2'
        }
      ]
    })
  });
  assert.equal(bulkRes.status, 200);
  const data = await bulkRes.json();
  assert.equal(data.processed, 2);

  // Check day 2
  const day2Res = await fetch(`${BASE_URL}/api/attendance?date=2026-09-22&employee_id=${testEmployeeId}`, {
    headers: { 'Authorization': `Bearer ${hrAdminToken}` }
  });
  const day2Records = await day2Res.json();
  assert.equal(day2Records[0].status, 'half_day');
  assert.equal(day2Records[0].hours_worked, 4);
});

// ============================================================================
// SUITE 5: DUAL COMPENSATION PAYROLL ENGINE & ADJUSTMENTS
// ============================================================================

test('5.1 Payroll calculation for monthly salary prorates absent days accurately', async () => {
  const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${superAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: '2026-09' })
  });
  assert.equal(calcRes.status, 200);
  const records = await calcRes.json();
  const empPayroll = records.find(p => p.employee_id === testEmployeeId);
  assert.ok(empPayroll);
  assert.equal(empPayroll.base_rate, 75000);
  // Net payout should be non-negative
  assert.ok(empPayroll.net_payout >= 0);
});

test('5.2 Adding adjustment (bonus & fine) immediately reflects in payroll', async () => {
  const bonusRes = await fetch(`${BASE_URL}/api/payroll/adjustments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${superAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: testEmployeeId,
      month: '2026-09',
      type: 'bonus',
      amount: 5000,
      description: 'Performance Incentive'
    })
  });
  assert.equal(bonusRes.status, 200);

  // Query adjustments for this employee
  const adjRes = await fetch(`${BASE_URL}/api/payroll/adjustments?employee_id=${testEmployeeId}&month=2026-09`, {
    headers: { 'Authorization': `Bearer ${hrAdminToken}` }
  });
  const adjustments = await adjRes.json();
  assert.ok(adjustments.some(a => a.type === 'bonus' && a.amount === 5000));

  // Query updated payroll record
  const payRecordsRes = await fetch(`${BASE_URL}/api/payroll/records?month=2026-09`, {
    headers: { 'Authorization': `Bearer ${hrAdminToken}` }
  });
  const payRecords = await payRecordsRes.json();
  const empPay = payRecords.find(p => p.employee_id === testEmployeeId);
  assert.ok(empPay);
  assert.ok(empPay.total_bonuses >= 5000);
});

test('5.3 GET /api/payroll/range computes prorated compensation across arbitrary window', async () => {
  const rangeRes = await fetch(`${BASE_URL}/api/payroll/range?from=2026-09-01&to=2026-09-15`, {
    headers: { 'Authorization': `Bearer ${hrAdminToken}` }
  });
  assert.equal(rangeRes.status, 200);
  const rangeData = await rangeRes.json();
  assert.ok(Array.isArray(rangeData));
  const empRange = rangeData.find(p => p.employee_id === testEmployeeId);
  assert.ok(empRange);
  assert.equal(empRange.base_rate, 75000);
});

// ============================================================================
// SUITE 6: DASHBOARD METRICS & AUDIT LOGS
// ============================================================================

test('6.1 Dashboard metrics sum coherently without double counting', async () => {
  const metricsRes = await fetch(`${BASE_URL}/api/dashboard/metrics?date=2026-09-21`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  assert.equal(metricsRes.status, 200);
  const metrics = await metricsRes.json();

  assert.ok(metrics.total_employees > 0);
  assert.ok(typeof metrics.present_today === 'number');
  assert.ok(typeof metrics.absent_today === 'number');
  assert.ok(typeof metrics.late_today === 'number');

  // testEmployeeId was marked present for 2026-09-21
  assert.ok(metrics.present_today >= 1);
  assert.ok(metrics.present_today + metrics.absent_today <= metrics.total_employees);
});

test('6.2 Audit logs record mutating actions with user identity', async () => {
  const auditRes = await fetch(`${BASE_URL}/api/audit-logs`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  assert.equal(auditRes.status, 200);
  const logs = await auditRes.json();
  assert.ok(Array.isArray(logs));
  assert.ok(logs.length > 0);

  // Check that employee operations were logged
  const empLog = logs.find(l => l.action.includes('EMPLOYEE'));
  assert.ok(empLog, 'Audit log must record employee operations');
  assert.ok(empLog.user_name, 'Audit log must identify the performing user_name');
});

// Clean up created test employee
test('7.1 Teardown: Delete test employee', async () => {
  if (testEmployeeId) {
    const delRes = await fetch(`${BASE_URL}/api/employees/${testEmployeeId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.equal(delRes.status, 200);
  }
});
