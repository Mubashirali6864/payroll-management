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
const FALLBACK_SECRET = 'dev-secret-change-in-production';

function makeToken(payload, secret, options = {}) {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...options });
}

const adminPayload = {
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
};

const cashierPayload = {
  userId: 'usr_cashier',
  email: 'cashier@mohsinco.com',
  role: 'cashier',
  permissions: {
    payroll: { view: true }
  }
};

const validAdminToken = makeToken(adminPayload, CONFIGURED_JWT_SECRET);
const fallbackToken = makeToken(adminPayload, FALLBACK_SECRET);
const cashierToken = makeToken(cashierPayload, CONFIGURED_JWT_SECRET);

test('VERIFY P0-01 (DEFECT-ADV-01): JWT Secret Integrity & Bypass Matrix', async (t) => {
  await t.test('1. Fallback secret token MUST return HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${fallbackToken}` }
    });
    assert.equal(res.status, 401, 'Fallback secret token must be rejected');
    const body = await res.json();
    assert.match(body.error, /invalid or expired token/i);
  });

  await t.test('2. Configured .env secret token MUST return HTTP 200', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${validAdminToken}` }
    });
    assert.equal(res.status, 200, 'Valid secret token must be accepted');
    const user = await res.json();
    assert.equal(user.email, 'admin@mohsinco.com');
  });

  await t.test('3. Bypass Check: Unauthenticated request MUST return HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`);
    assert.equal(res.status, 401, 'Unauthenticated request must return 401');
  });

  await t.test('4. Bypass Check: Token with alg: none MUST return HTTP 401', async () => {
    // Construct unsigned alg: none token
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(adminPayload)).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${noneToken}` }
    });
    assert.equal(res.status, 401, 'alg:none token must return 401');
  });

  await t.test('5. Bypass Check: Expired token MUST return HTTP 401', async () => {
    const expiredToken = makeToken(adminPayload, CONFIGURED_JWT_SECRET, { expiresIn: '-10s' });
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    assert.equal(res.status, 401, 'Expired token must return 401');
  });

  await t.test('6. Bypass Check: Cashier token accessing protected User Management MUST return HTTP 403', async () => {
    const res = await fetch(`${BASE_URL}/api/settings/users`, {
      headers: { 'Authorization': `Bearer ${cashierToken}` }
    });
    assert.equal(res.status, 403, 'Cashier must not have settings/user_roles permission');
  });
});

test('VERIFY P0-02 (DEFECT-ADV-02): Partial User Update & DoS Resistance', async (t) => {
  await t.test('1. Create temporary test user for update verification', async () => {
    const testEmail = `verify_u_${Date.now()}@mohsinco.com`;
    const createRes = await fetch(`${BASE_URL}/api/settings/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Verification Target User',
        email: testEmail,
        password: 'Password123!',
        contact: '03001112233',
        role: 'hr_admin',
        department: 'Operations',
        permissions: { employees: { view: true } }
      })
    });
    assert.equal(createRes.status, 200, 'User created');
    const createdUser = await createRes.json();
    const targetUserId = createdUser.id;

    // 2. Partial update: Only contact
    const updateContactRes = await fetch(`${BASE_URL}/api/settings/users/${targetUserId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contact: '+92 311 8887766'
      })
    });
    assert.equal(updateContactRes.status, 200, 'Partial update contact succeeded without crash');
    const afterContact = await updateContactRes.json();
    assert.equal(afterContact.contact, '+92 311 8887766');
    assert.equal(afterContact.name, 'Verification Target User', 'Name preserved');
    assert.equal(afterContact.email, testEmail, 'Email preserved');
    assert.equal(afterContact.role, 'hr_admin', 'Role preserved');

    // 3. Partial update: Only role
    const updateRoleRes = await fetch(`${BASE_URL}/api/settings/users/${targetUserId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'manager'
      })
    });
    assert.equal(updateRoleRes.status, 200, 'Partial update role succeeded');
    const afterRole = await updateRoleRes.json();
    assert.equal(afterRole.role, 'manager');
    assert.equal(afterRole.contact, '+92 311 8887766', 'Contact preserved');

    // 4. Edge Case: Empty object payload {}
    const emptyPayloadRes = await fetch(`${BASE_URL}/api/settings/users/${targetUserId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    assert.equal(emptyPayloadRes.status, 200, 'Empty payload handled gracefully');

    // 5. Edge Case: Nonexistent user ID
    const notFoundRes = await fetch(`${BASE_URL}/api/settings/users/non_existent_usr_99999`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contact: '00000000000' })
    });
    assert.equal(notFoundRes.status, 404, 'Nonexistent user returns 404');

    // 6. Liveness verification: Server process is still alive and responsive
    const pingRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${validAdminToken}` }
    });
    assert.equal(pingRes.status, 200, 'Server remains healthy and responsive');

    // Cleanup user
    await fetch(`${BASE_URL}/api/settings/users/${targetUserId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${validAdminToken}` }
    });
  });
});

test('VERIFY P0-03 (DEFECT-01): Adjustment Target Month Isolation & Retroactive Accuracy', async (t) => {
  const targetMonth = '2026-05';
  const otherMonth = '2026-06';
  const creationMonth = '2026-08';

  // 1. Create a test employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Retroactive Test Employee',
      email: `retro_${Date.now()}@mohsinco.com`,
      phone: '03001234999',
      cnic: '42101-9999999-1',
      department: 'Finance',
      designation: 'Accountant',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 80000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200, 'Test employee created');
  const emp = await empRes.json();

  // 2. Add retroactive bonus for May 2026 entered right now (August 2026)
  const bonusRes = await fetch(`${BASE_URL}/api/payroll/adjustments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      month: targetMonth,
      type: 'bonus',
      amount: 15000,
      description: 'May Performance Bonus added retroactively in August'
    })
  });
  assert.equal(bonusRes.status, 200, 'Bonus added');

  // 3. Add retroactive fine for May 2026
  const fineRes = await fetch(`${BASE_URL}/api/payroll/adjustments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      month: targetMonth,
      type: 'fine',
      amount: 2500,
      description: 'May Policy Infraction Fine'
    })
  });
  assert.equal(fineRes.status, 200, 'Fine added');

  // 4. Calculate payroll for May 2026 (targetMonth)
  const payTargetRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: targetMonth })
  });
  assert.equal(payTargetRes.status, 200, 'May payroll calculated');
  const targetRecords = await payTargetRes.json();
  const targetRecord = targetRecords.find(r => r.employee_id === emp.id);
  assert.ok(targetRecord, 'Record found in May');
  assert.equal(targetRecord.total_bonuses, 15000, 'May must include the 15,000 bonus');
  assert.equal(targetRecord.total_fines, 2500, 'May must include the 2,500 fine');

  // 5. Calculate payroll for June 2026 (otherMonth)
  const payOtherRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: otherMonth })
  });
  assert.equal(payOtherRes.status, 200, 'June payroll calculated');
  const otherRecords = await payOtherRes.json();
  const otherRecord = otherRecords.find(r => r.employee_id === emp.id);
  assert.ok(otherRecord, 'Record found in June');
  assert.equal(otherRecord.total_bonuses, 0, 'June must NOT have May bonus');
  assert.equal(otherRecord.total_fines, 0, 'June must NOT have May fine');

  // 6. Calculate payroll for August 2026 (creationMonth)
  const payCreationRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: creationMonth })
  });
  assert.equal(payCreationRes.status, 200, 'August payroll calculated');
  const creationRecords = await payCreationRes.json();
  const creationRecord = creationRecords.find(r => r.employee_id === emp.id);
  assert.ok(creationRecord, 'Record found in August');
  assert.equal(creationRecord.total_bonuses, 0, 'August must NOT have May bonus bleeding into it');
  assert.equal(creationRecord.total_fines, 0, 'August must NOT have May fine bleeding into it');

  // 7. Test Idempotency: Re-calculate May payroll, verify no duplicated bonuses or fines
  const reCalcTargetRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: targetMonth })
  });
  const reCalcRecords = await reCalcTargetRes.json();
  const reCalcRecord = reCalcRecords.find(r => r.employee_id === emp.id);
  assert.equal(reCalcRecord.total_bonuses, 15000, 'Idempotent recalculation preserves exact bonus');
  assert.equal(reCalcRecord.total_fines, 2500, 'Idempotent recalculation preserves exact fine');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${validAdminToken}` }
  });
});
