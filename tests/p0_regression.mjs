import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../mohsin-&-co-payroll-&-attendance/node_modules/jsonwebtoken/index.js';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

// Read the actual secret from .env
const envPath = path.resolve('mohsin-&-co-payroll-&-attendance/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envSecretMatch = envContent.match(/JWT_SECRET\s*=\s*(.+)/);
const CONFIGURED_JWT_SECRET = envSecretMatch ? envSecretMatch[1].trim() : '';
const DEFAULT_FALLBACK_SECRET = 'dev-secret-change-in-production';

function getAdminToken(secret) {
  return jwt.sign({
    userId: 'usr_1',
    email: 'admin@mohsinco.com',
    role: 'super_admin',
    permissions: {}
  }, secret, { expiresIn: '8h' });
}

test('P0-01 (DEFECT-ADV-01): Fallback secret token rejected (401) and .env secret accepted (200)', async () => {
  // Test 1: A token signed with the unconfigured fallback secret MUST BE REJECTED (401)
  const forgedToken = getAdminToken(DEFAULT_FALLBACK_SECRET);
  const resForged = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${forgedToken}` }
  });
  assert.equal(resForged.status, 401, 'SECURITY GATE: Tokens signed with default fallback secret must be rejected with 401');

  // Test 2: A token signed with the configured .env secret MUST BE ACCEPTED (200)
  const validToken = getAdminToken(CONFIGURED_JWT_SECRET);
  const resValid = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${validToken}` }
  });
  assert.equal(resValid.status, 200, 'Configured .env secret must authenticate successfully');
  const validData = await resValid.json();
  assert.ok(validData.userId);
});

test('P0-02 (DEFECT-ADV-02): Partial user update does not crash server and merges fields', async () => {
  // Login with admin credentials or valid token
  const validToken = getAdminToken(CONFIGURED_JWT_SECRET);

  // Fetch current user details
  const getRes = await fetch(`${BASE_URL}/api/settings/users`, {
    headers: { 'Authorization': `Bearer ${validToken}` }
  });
  assert.equal(getRes.status, 200);
  const users = await getRes.json();
  const targetUser = users.find(u => u.role === 'super_admin') || users[0];
  assert.ok(targetUser, 'Admin user exists');
  const targetId = targetUser.id;

  // Send partial update containing ONLY contact (name, email, role omitted)
  const testContact = `0300${Math.floor(1000000 + Math.random() * 9000000)}`;
  const putRes = await fetch(`${BASE_URL}/api/settings/users/${targetId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contact: testContact
    })
  });

  assert.equal(putRes.status, 200, 'Partial update must return 200 without crashing');
  const updatedUser = await putRes.json();
  assert.equal(updatedUser.contact, testContact);
  assert.equal(updatedUser.name, targetUser.name, 'Existing name must be preserved');
  assert.equal(updatedUser.email, targetUser.email, 'Existing email must be preserved');
  assert.equal(updatedUser.role, targetUser.role, 'Existing role must be preserved');

  // Verify server is still alive
  const healthRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${validToken}` }
  });
  assert.equal(healthRes.status, 200, 'Server must remain alive after partial update');
});

test('P0-03 (DEFECT-01): Retroactive adjustments credited to target month and do not bleed into creation month', async () => {
  const validToken = getAdminToken(CONFIGURED_JWT_SECRET);

  // Create temporary employee
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Retroactive Bonus Worker',
      email: `retro_${Date.now()}@mohsinco.com`,
      phone: '03001234599',
      cnic: '42101-5555555-1',
      department: 'Operations',
      designation: 'Technician',
      joining_date: '2026-01-01',
      employment_type: 'monthly_salary',
      base_salary: 50000,
      shift_id: 'shift_gen'
    })
  });
  assert.equal(empRes.status, 200);
  const emp = await empRes.json();

  // Add retroactive bonus for July 2026 (created today in August 2026)
  const bonusAmount = 8500;
  const adjRes = await fetch(`${BASE_URL}/api/payroll/adjustments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee_id: emp.id,
      month: '2026-07',
      type: 'bonus',
      amount: bonusAmount,
      description: 'July Performance Incentive'
    })
  });
  assert.equal(adjRes.status, 200);

  // Calculate payroll for July 2026
  const calcJulyRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: '2026-07' })
  });
  assert.equal(calcJulyRes.status, 200);
  const julyRecords = await calcJulyRes.json();
  const julyEmpRecord = julyRecords.find(r => r.employee_id === emp.id);

  assert.ok(julyEmpRecord, 'July payroll record must exist');
  assert.equal(julyEmpRecord.total_bonuses, bonusAmount, 'July payroll must include retroactive bonus');

  // Calculate payroll for August 2026 and verify July bonus does NOT bleed into August
  const calcAugRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ month: '2026-08' })
  });
  assert.equal(calcAugRes.status, 200);
  const augRecords = await calcAugRes.json();
  const augEmpRecord = augRecords.find(r => r.employee_id === emp.id);

  assert.ok(augEmpRecord, 'August payroll record must exist');
  assert.equal(augEmpRecord.total_bonuses, 0, 'August payroll must NOT include July bonus');

  // Cleanup
  await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${validToken}` }
  });
});
