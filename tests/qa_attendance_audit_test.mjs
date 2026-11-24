import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000';

let authToken = '';

test('1. Admin authentication succeeds', async () => {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@mohsinco.com',
      password: 'MohsinCoSecure2026!'
    })
  });
  assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
  const data = await res.json();
  assert.ok(data.token, 'Token should be returned');
  authToken = data.token;
});

test('2. Active employees exist and match baseline', async () => {
  const res = await fetch(`${BASE_URL}/api/employees`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  assert.equal(res.status, 200);
  const emps = await res.json();
  assert.ok(Array.isArray(emps), 'Employees must be an array');
  assert.ok(emps.length >= 3, `Expected at least 3 employees, got ${emps.length}`);
  const activeEmps = emps.filter(e => e.status === 'active');
  assert.ok(activeEmps.length >= 3, 'Active employees should be >= 3');
});

test('3. GET /api/attendance?date=YYYY-MM-DD synthesizes full active employee roster', async () => {
  const dateStr = '2026-09-08'; // Tuesday (weekday)
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const allActiveEmps = (await empRes.json()).filter(e => e.status === 'active' && (!e.joining_date || e.joining_date <= dateStr));

  const attRes = await fetch(`${BASE_URL}/api/attendance?date=${dateStr}`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  assert.equal(attRes.status, 200);
  const roster = await attRes.json();

  assert.equal(roster.length, allActiveEmps.length, `Roster count (${roster.length}) must match active headcount (${allActiveEmps.length})`);

  for (const emp of allActiveEmps) {
    const record = roster.find(r => r.employee_id === emp.id);
    assert.ok(record, `Employee ${emp.name} (${emp.employee_code}) must be present in daily roster`);
    assert.ok(['present', 'late', 'absent', 'half_day', 'leave', 'weekly_off'].includes(record.status), `Valid status for ${emp.name}: ${record.status}`);
  }
});

test('4. Manual override on synthesized record promotes it to persisted SQLite row', async () => {
  const testDate = '2026-09-09';
  const overrideRes = await fetch(`${BASE_URL}/api/attendance/override`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      employee_id: 'emp_001',
      date: testDate,
      check_in_time: '09:00:00',
      check_out_time: '17:00:00',
      status: 'present',
      reason: 'QA Audit Test Manual Punch'
    })
  });
  assert.equal(overrideRes.status, 200);
  const overrideData = await overrideRes.json();
  assert.equal(overrideData.success, true);

  // Re-fetch daily roster
  const attRes = await fetch(`${BASE_URL}/api/attendance?date=${testDate}`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const roster = await attRes.json();
  const emp1Record = roster.find(r => r.employee_id === 'emp_001');
  assert.ok(emp1Record);
  assert.equal(emp1Record.status, 'present');
  assert.equal(emp1Record.is_manual_override, 1);
  assert.equal(emp1Record.check_in_time, '09:00:00');
  assert.equal(emp1Record.check_out_time, '17:00:00');
});

test('5. Dashboard metrics align with attendance state and do not double count', async () => {
  const res = await fetch(`${BASE_URL}/api/dashboard/metrics?date=2026-09-09`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  assert.equal(res.status, 200);
  const metrics = await res.json();
  
  assert.ok(typeof metrics.total_employees === 'number');
  assert.ok(typeof metrics.present_today === 'number');
  assert.ok(typeof metrics.absent_today === 'number');
  assert.ok(typeof metrics.late_today === 'number');

  // emp_001 was manually marked present for 2026-09-09
  assert.ok(metrics.present_today >= 1, 'At least emp_001 is present');
  // present + absent + (off) should not exceed total_employees
  assert.ok(metrics.present_today + metrics.absent_today <= metrics.total_employees, 'Present + absent cannot exceed total');
});
