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

function makeToken(payload, secret = CONFIGURED_JWT_SECRET, options = { expiresIn: '8h' }) {
  return jwt.sign(payload, secret, options);
}

test('ADVERSARIAL ATTACK P0-01: Token forgery, malformed secrets, and RBAC bypass attempts', async () => {
  // 1. Unauthenticated request
  const resNoAuth = await fetch(`${BASE_URL}/api/settings/users`);
  assert.equal(resNoAuth.status, 401, 'Unauthenticated request must be 401');

  // 2. Token forged with 'none' algorithm (unsigned token bypass attempt)
  const noneAlgToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJ1c3JfMSIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9.';
  const resNone = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${noneAlgToken}` }
  });
  assert.equal(resNone.status, 401, 'Unsigned / none algorithm token must be 401');

  // 3. Token forged with 'dev-secret-change-in-production'
  const fallbackToken = makeToken({ userId: 'usr_1', role: 'super_admin' }, 'dev-secret-change-in-production');
  const resFallback = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${fallbackToken}` }
  });
  assert.equal(resFallback.status, 401, 'Fallback secret token must be 401');

  // 4. Token with insufficient role (cashier attempting admin settings route)
  const cashierToken = makeToken({
    userId: 'usr_cashier',
    email: 'cashier@mohsinco.com',
    role: 'cashier',
    permissions: { settings: { user_roles: false } }
  });
  const resForbidden = await fetch(`${BASE_URL}/api/settings/users`, {
    headers: { 'Authorization': `Bearer ${cashierToken}` }
  });
  assert.equal(resForbidden.status, 403, 'Insufficient role must be 403 Forbidden');

  // 5. Expired token signed with correct secret
  const expiredToken = makeToken(
    { userId: 'usr_1', email: 'admin@mohsinco.com', role: 'super_admin', permissions: {} },
    CONFIGURED_JWT_SECRET,
    { expiresIn: '-10s' }
  );
  const resExpired = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${expiredToken}` }
  });
  assert.equal(resExpired.status, 401, 'Expired token must be 401');
});

test('ADVERSARIAL ATTACK P0-02: Partial update edge cases, nonexistent users, and empty payloads', async () => {
  const adminToken = makeToken({
    userId: 'usr_1',
    email: 'admin@mohsinco.com',
    role: 'super_admin',
    permissions: { settings: { user_roles: true } }
  });

  const usersRes = await fetch(`${BASE_URL}/api/settings/users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const usersList = await usersRes.json();
  const targetUser = usersList.find(u => u.role === 'super_admin') || usersList[0];
  const targetId = targetUser.id;

  // 1. Completely empty update payload {}
  const resEmptyBody = await fetch(`${BASE_URL}/api/settings/users/${targetId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  assert.equal(resEmptyBody.status, 200, 'Empty update payload should succeed and keep existing data intact');
  const emptyResData = await resEmptyBody.json();
  assert.ok(emptyResData.name, 'Admin user should retain name');

  // 2. Non-existent user ID
  const resNonExistent = await fetch(`${BASE_URL}/api/settings/users/usr_does_not_exist_999`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contact: '03001111111' })
  });
  assert.equal(resNonExistent.status, 404, 'Non-existent user must return 404');

  // 3. Partial update with valid 2-level permissions schema
  const resPerms = await fetch(`${BASE_URL}/api/settings/users/${targetId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      permissions: { custom_module: { can_do_x: true } }
    })
  });
  assert.equal(resPerms.status, 200, 'Valid permissions update must succeed');

  // 4. Repeated concurrent partial updates
  const updatePromises = Array.from({ length: 5 }, (_, i) =>
    fetch(`${BASE_URL}/api/settings/users/${targetId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contact: `0300000000${i}` })
    })
  );
  const results = await Promise.all(updatePromises);
  results.forEach(res => {
    assert.equal(res.status, 200, 'Concurrent partial updates must not crash server');
  });

  // Verify server is healthy
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(meRes.status, 200);
});

test('ADVERSARIAL ATTACK P0-03: Multi-adjustment composition, retroactive fines/advances, and payslip alignment', async () => {
  const adminToken = makeToken({
    userId: 'usr_1',
    email: 'admin@mohsinco.com',
    role: 'super_admin',
    permissions: {
      employees: { view: true, add: true, edit: true },
      payroll: { view: true, calculate: true, adjustments: true }
    }
  });

  // 1. Create test employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Adversarial Adjustment Employee',
      email: `adv_adj_${Date.now()}@mohsinco.com`,
      phone: '03009998877',
      cnic: '42101-4444444-1',
      department: 'Finance',
      designation: 'Accountant',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 60000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // 2. Add multiple retroactive adjustments for month 2026-06 (created today in 2026-08):
  // Bonus: 5000, Fine: 1500, Advance: 2000
  const adjustments = [
    { type: 'bonus', amount: 5000, description: 'Retroactive Bonus' },
    { type: 'fine', amount: 1500, description: 'Retroactive Fine' },
    { type: 'advance_deduction', amount: 2000, description: 'Retroactive Advance' }
  ];

  for (const adj of adjustments) {
    const res = await fetch(`${BASE_URL}/api/payroll/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: emp.id,
        month: '2026-06',
        ...adj
      })
    });
    assert.equal(res.status, 200);
  }

  // 3. Verify GET /api/payroll/adjustments returns all 3 for 2026-06
  const getAdjRes = await fetch(`${BASE_URL}/api/payroll/adjustments?employee_id=${emp.id}&month=2026-06`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(getAdjRes.status, 200);
  const adjList = await getAdjRes.json();
  assert.equal(adjList.length, 3, 'GET /api/payroll/adjustments must return all 3 retroactive adjustments for 2026-06');

  // 4. Calculate 2026-06 payroll
  const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: '2026-06' })
  });
  assert.equal(calcRes.status, 200);
  const records = await calcRes.json();
  const record = records.find(r => r.employee_id === emp.id);

  assert.ok(record, 'Payroll record for 2026-06 must exist');
  assert.equal(record.total_bonuses, 5000, 'Total bonuses must match 5000');
  assert.equal(record.total_fines, 1500, 'Total fines must match 1500');
  assert.equal(record.advance_deductions, 2000, 'Advance deductions must match 2000');

  // 5. Calculate 2026-08 (creation month) and verify isolation
  const calcAugRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: '2026-08' })
  });
  const augRecords = await calcAugRes.json();
  const augRecord = augRecords.find(r => r.employee_id === emp.id);
  assert.equal(augRecord.total_bonuses, 0, 'August must not have 2026-06 bonuses');
  assert.equal(augRecord.total_fines, 0, 'August must not have 2026-06 fines');
  assert.equal(augRecord.advance_deductions, 0, 'August must not have 2026-06 advance deductions');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});
