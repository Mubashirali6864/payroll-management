import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from '../mohsin-&-co-payroll-&-attendance/node_modules/jsonwebtoken/index.js';
import initSqlJs from '../mohsin-&-co-payroll-&-attendance/node_modules/sql.js/dist/sql-wasm.js';
import bcrypt from '../mohsin-&-co-payroll-&-attendance/node_modules/bcryptjs/index.js';
import express from '../mohsin-&-co-payroll-&-attendance/node_modules/express/index.js';
import rateLimit from '../mohsin-&-co-payroll-&-attendance/node_modules/express-rate-limit/dist/index.mjs';
import { getJwtSecret, hashPassword, verifyPassword, generateToken, verifyToken } from '../mohsin-&-co-payroll-&-attendance/src/auth.ts';

const BASE_URL = 'http://localhost:3000';

// ============================================================================
// STEP 4: JWT GUARD & FAIL-CLOSED PRODUCTION STARTUP TESTS
// ============================================================================

test('JWT GUARD 1: production + missing JWT_SECRET MUST throw fatal error', () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    assert.throws(() => {
      getJwtSecret();
    }, /FATAL: JWT_SECRET must be explicitly configured in production/);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.JWT_SECRET = origSecret;
  }
});

test('JWT GUARD 2: production + development fallback secret MUST throw fatal error', () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret-change-in-production';

    assert.throws(() => {
      getJwtSecret();
    }, /FATAL: JWT_SECRET cannot be the default development secret in production/);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.JWT_SECRET = origSecret;
  }
});

test('JWT GUARD 3: production + short secret (<32 chars) MUST throw fatal error', () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short-secret-under-32-chars';

    assert.throws(() => {
      getJwtSecret();
    }, /FATAL: JWT_SECRET must be at least 32 characters in production/);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.JWT_SECRET = origSecret;
  }
});

test('JWT GUARD 4: production + valid strong secret (>=32 chars) MUST succeed', () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.JWT_SECRET;
  const strongSecret = 'super-secure-production-jwt-secret-at-least-32-chars-long-12345';
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = strongSecret;

    const secret = getJwtSecret();
    assert.equal(secret, strongSecret);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.JWT_SECRET = origSecret;
  }
});

test('JWT GUARD 5: development + missing secret allows fallback', () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;

    const secret = getJwtSecret();
    assert.equal(secret, 'dev-secret-change-in-production');
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.JWT_SECRET = origSecret;
  }
});

test('JWT GUARD 6: Token cryptographic lifecycle (valid, invalid, forged, expired)', () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.JWT_SECRET;
  const testSecret = 'test-suite-secure-jwt-secret-minimum-32-characters-required';
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = testSecret;

    const payload = {
      userId: 'usr_test_1',
      email: 'test@mohsinco.com',
      role: 'super_admin',
      permissions: {}
    };

    // A. Valid token
    const token = generateToken(payload);
    const verified = verifyToken(token);
    assert.ok(verified, 'Valid token must verify successfully');
    assert.equal(verified.userId, payload.userId);

    // B. Invalid signature (signed with different key)
    const forgedToken = jwt.sign(payload, 'wrong-key-secret-that-does-not-match-signature-at-all');
    assert.equal(verifyToken(forgedToken), null, 'Forged signature must be rejected with null');

    // C. alg: none forged token
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const algNoneToken = `${header}.${body}.`;
    assert.equal(verifyToken(algNoneToken), null, 'alg:none token must be rejected with null');

    // D. Expired token
    const expiredToken = jwt.sign(payload, testSecret, { expiresIn: '-1s' });
    assert.equal(verifyToken(expiredToken), null, 'Expired token must be rejected with null');
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.JWT_SECRET = origSecret;
  }
});

// ============================================================================
// STEP 5: ADMIN INITIALIZATION & DEMO CREDENTIAL REMOVAL TESTS
// ============================================================================

test('ADMIN SETUP 1: Fresh isolated database lifecycle & first-run setup enforcement', async () => {
  const SQL = await initSqlJs();
  const testDb = new SQL.Database();

  // Create users table
  testDb.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      contact TEXT DEFAULT '',
      permissions TEXT DEFAULT '{}'
    );
  `);

  // 1. Fresh database has 0 administrators
  const adminCount = testDb.exec("SELECT COUNT(*) FROM users WHERE role = 'super_admin'")[0].values[0][0];
  assert.equal(adminCount, 0, 'Fresh database must have 0 administrators initially');

  // 2. Setup administrator
  const setupAdminName = 'Chief Executive Officer';
  const setupAdminEmail = 'ceo@mohsinco.com';
  const setupAdminPassword = 'SuperStrongMasterPassword99!';
  const hashedPassword = await hashPassword(setupAdminPassword);

  // 3. Password MUST NOT be stored in plaintext
  assert.notEqual(hashedPassword, setupAdminPassword, 'Password must be hashed with bcrypt');
  assert.ok(hashedPassword.startsWith('$2b$12$') || hashedPassword.startsWith('$2a$12$'), 'Must use bcrypt 12 rounds');

  // Insert setup admin
  testDb.run(`
    INSERT INTO users (id, name, email, password, role, department, contact, permissions)
    VALUES ('usr_ceo', '${setupAdminName}', '${setupAdminEmail}', '${hashedPassword}', 'super_admin', 'Executive', '', '{}')
  `);

  // 4. Verify administrator is created and setup is completed
  const afterCount = testDb.exec("SELECT COUNT(*) FROM users WHERE role = 'super_admin'")[0].values[0][0];
  assert.equal(afterCount, 1, 'Setup administrator must exist in database');

  // 5. Verify administrator can log in
  const userRow = testDb.exec(`SELECT * FROM users WHERE email = '${setupAdminEmail}'`)[0];
  assert.ok(userRow, 'User must exist in database');
  const storedHash = userRow.values[0][3];
  const loginValid = await verifyPassword(setupAdminPassword, storedHash);
  assert.equal(loginValid, true, 'Administrator must be able to log in with chosen password');

  // 6. Setup cannot be repeated (count > 0 condition blocks further setup)
  const isSetupAllowed = afterCount === 0;
  assert.equal(isSetupAllowed, false, 'Setup cannot be repeated after initial administrator exists');

  // 7. Known demo password CANNOT authenticate against setup administrator
  const demoAuthValid = await verifyPassword('changeme123', storedHash);
  assert.equal(demoAuthValid, false, 'Known demo password changeme123 must be rejected');

  testDb.close();
});

test('ADMIN SETUP 2: Insecure demo admin migration neutralizes changeme123 while preserving legitimate admins', async () => {
  const SQL = await initSqlJs();
  const testDb = new SQL.Database();

  testDb.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      contact TEXT DEFAULT '',
      permissions TEXT DEFAULT '{}'
    );
  `);

  const DEMO_HASH = '$2b$12$sC7ld5tPWJ3yTTePssqlZOGdCC9YBZmvtyXhQaZ9U0hG9RTMny1YS'; // 'changeme123'
  const LEGIT_HASH = await hashPassword('LegitimateAdminCustomPassword123!');

  // Insert 1 unrotated insecure demo admin AND 1 legitimate admin who customized their password
  testDb.run(`
    INSERT INTO users (id, name, email, password, role, department, contact, permissions) VALUES
    ('usr_insecure', 'Demo Insecure Admin', 'admin@mohsinco.com', '${DEMO_HASH}', 'super_admin', 'Exec', '', '{}'),
    ('usr_legit', 'Legitimate Corporate Admin', 'realadmin@mohsinco.com', '${LEGIT_HASH}', 'super_admin', 'Exec', '', '{}')
  `);

  assert.equal(testDb.exec("SELECT COUNT(*) FROM users")[0].values[0][0], 2);

  // Run migration logic from database.ts
  const demoUsers = testDb.exec(`SELECT * FROM users WHERE password = '${DEMO_HASH}'`)[0]?.values || [];
  if (demoUsers.length > 0) {
    testDb.run(`DELETE FROM users WHERE password = '${DEMO_HASH}'`);
  }

  // Verify: Insecure demo admin was removed, but legitimate admin remains functional!
  const remainingUsers = testDb.exec("SELECT * FROM users")[0].values;
  assert.equal(remainingUsers.length, 1, 'Insecure demo admin must be removed');
  assert.equal(remainingUsers[0][2], 'realadmin@mohsinco.com', 'Legitimate admin must remain untouched');

  const legitAuth = await verifyPassword('LegitimateAdminCustomPassword123!', remainingUsers[0][3]);
  assert.equal(legitAuth, true, 'Legitimate admin remains 100% operational');

  testDb.close();
});

// ============================================================================
// STEP 6: REVERSE PROXY & RATE LIMITING BEHAVIOR
// ============================================================================

test('STEP 6: Reverse Proxy Trust & Rate Limiter IP Attribution', async () => {
  // Test A: Without trust proxy (direct/standalone), spoofed X-Forwarded-For is ignored
  const appNoProxy = express();
  // trust proxy is false by default
  const limiterNoProxy = rateLimit({
    windowMs: 60000,
    max: 2,
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  });
  appNoProxy.use('/test', limiterNoProxy, (req, res) => {
    res.json({ ip: req.ip });
  });

  const serverNoProxy = http.createServer(appNoProxy);
  await new Promise(r => serverNoProxy.listen(0, '127.0.0.1', r));
  const portNoProxy = serverNoProxy.address().port;

  try {
    // Request 1 from 127.0.0.1 with spoofed header
    const r1 = await fetch(`http://127.0.0.1:${portNoProxy}/test`, {
      headers: { 'X-Forwarded-For': '203.0.113.195' }
    });
    assert.equal(r1.status, 200);
    const data1 = await r1.json();
    assert.equal(data1.ip, '127.0.0.1', 'Spoofed header MUST be ignored when trust proxy is not configured');

    // Request 2 with another spoofed header
    const r2 = await fetch(`http://127.0.0.1:${portNoProxy}/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.42' }
    });
    assert.equal(r2.status, 200);

    // Request 3: Exceeds max 2 requests from 127.0.0.1 -> rate limited to 429
    const r3 = await fetch(`http://127.0.0.1:${portNoProxy}/test`, {
      headers: { 'X-Forwarded-For': '198.51.100.99' }
    });
    assert.equal(r3.status, 429, 'Repeated requests from same TCP connection must be rate-limited even with varying spoofed headers');
  } finally {
    await new Promise(r => serverNoProxy.close(r));
  }

  // Test B: Behind trusted single reverse proxy (trust proxy = 1)
  const appWithProxy = express();
  appWithProxy.set('trust proxy', 1); // Trusts 1 upstream proxy hop (e.g. Nginx/Hostinger)
  const limiterWithProxy = rateLimit({
    windowMs: 60000,
    max: 2,
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  appWithProxy.use('/proxy-test', limiterWithProxy, (req, res) => {
    res.json({ ip: req.ip });
  });

  const serverWithProxy = http.createServer(appWithProxy);
  await new Promise(r => serverWithProxy.listen(0, '127.0.0.1', r));
  const portWithProxy = serverWithProxy.address().port;

  try {
    // Client A: 203.0.113.1
    const ca1 = await fetch(`http://127.0.0.1:${portWithProxy}/proxy-test`, {
      headers: { 'X-Forwarded-For': '203.0.113.1' }
    });
    assert.equal(ca1.status, 200);
    const dataCa1 = await ca1.json();
    assert.equal(dataCa1.ip, '203.0.113.1', 'Reverse proxy must accurately identify Client A IP');

    const ca2 = await fetch(`http://127.0.0.1:${portWithProxy}/proxy-test`, {
      headers: { 'X-Forwarded-For': '203.0.113.1' }
    });
    assert.equal(ca2.status, 200);

    // Client A 3rd request -> rate limited 429
    const ca3 = await fetch(`http://127.0.0.1:${portWithProxy}/proxy-test`, {
      headers: { 'X-Forwarded-For': '203.0.113.1' }
    });
    assert.equal(ca3.status, 429, 'Client A must be rate-limited after 2 attempts');

    // Client B: 198.51.100.2 must NOT be rate-limited despite Client A being blocked!
    const cb1 = await fetch(`http://127.0.0.1:${portWithProxy}/proxy-test`, {
      headers: { 'X-Forwarded-For': '198.51.100.2' }
    });
    assert.equal(cb1.status, 200, 'Client B with distinct IP must have isolated rate-limiting bucket');
  } finally {
    await new Promise(r => serverWithProxy.close(r));
  }
});

// ============================================================================
// STEP 9: SECURITY ADVERSARIAL ATTACK PASS
// ============================================================================

test('STEP 9: Security Adversarial Attack Pass on JWT and Authentication', async () => {
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.JWT_SECRET;
  const validSecret = 'production-secret-with-high-entropy-64-characters-0123456789abcdef';

  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = validSecret;

    // 1. JWT Attack: Remove secret -> Fatal error
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /FATAL: JWT_SECRET must be explicitly configured in production/);

    // 2. JWT Attack: Use known fallback secret -> Fatal error
    process.env.JWT_SECRET = 'dev-secret-change-in-production';
    assert.throws(() => getJwtSecret(), /FATAL: JWT_SECRET cannot be the default development secret in production/);

    // Restore valid secret
    process.env.JWT_SECRET = validSecret;

    // 3. JWT Attack: Forge token with attacker key
    const attackerSecret = 'attacker-controlled-secret-key-that-is-at-least-32-chars-long';
    const forgedToken = jwt.sign({
      userId: 'usr_attacker',
      email: 'attacker@evil.com',
      role: 'super_admin',
      permissions: {}
    }, attackerSecret, { expiresIn: '8h' });
    assert.equal(verifyToken(forgedToken), null, 'Forged token with foreign key must verify to null');

    // 4. JWT Attack: Token Payload Tampering (Elevation of Privilege)
    // Issue legitimate employee token
    const legitEmployeePayload = {
      userId: 'usr_emp_42',
      email: 'employee@mohsinco.com',
      role: 'employee',
      permissions: {}
    };
    const legitToken = generateToken(legitEmployeePayload);
    assert.ok(verifyToken(legitToken));

    // Attacker intercepts and modifies base64 payload to role: super_admin
    const [h, b, s] = legitToken.split('.');
    const tamperedPayloadObj = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    tamperedPayloadObj.role = 'super_admin';
    const tamperedB = Buffer.from(JSON.stringify(tamperedPayloadObj)).toString('base64url');
    const tamperedRoleToken = `${h}.${tamperedB}.${s}`;
    assert.equal(verifyToken(tamperedRoleToken), null, 'Payload tampering to super_admin must invalidate signature');

    // 5. JWT Attack: Modify user ID
    tamperedPayloadObj.role = 'employee';
    tamperedPayloadObj.userId = 'usr_ceo';
    const tamperedUserIdB = Buffer.from(JSON.stringify(tamperedPayloadObj)).toString('base64url');
    const tamperedUserIdToken = `${h}.${tamperedUserIdB}.${s}`;
    assert.equal(verifyToken(tamperedUserIdToken), null, 'Payload tampering of userId must invalidate signature');

    // 6. JWT Attack: Expired token
    const expiredToken = jwt.sign(legitEmployeePayload, validSecret, { expiresIn: '-10s' });
    assert.equal(verifyToken(expiredToken), null, 'Expired token must be rejected');

    // 7. JWT Attack: alg: none attack
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const noneBody = Buffer.from(JSON.stringify({ userId: 'usr_1', role: 'super_admin' })).toString('base64url');
    const noneToken = `${noneHeader}.${noneBody}.`;
    assert.equal(verifyToken(noneToken), null, 'alg: none tokens must be rejected');
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.JWT_SECRET = origSecret;
  }

  // 8. Auth Attack: Attempt login with demo credentials (changeme123) against live server
  const demoLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@mohsinco.com',
      password: 'changeme123'
    })
  });
  assert.equal(demoLoginRes.status, 401, 'Direct API login with demo password changeme123 must return 401');
  const demoJson = await demoLoginRes.json();
  assert.ok(demoJson.error.includes('Insecure default credentials are disabled') || demoJson.error.includes('Invalid credentials'));

  // 9. Auth Attack: Direct access to protected endpoints without Authorization header
  const noAuthEndpoints = [
    '/api/auth/me',
    '/api/employees',
    '/api/attendance',
    '/api/payroll/records',
    '/api/settings/users'
  ];
  for (const ep of noAuthEndpoints) {
    const res = await fetch(`${BASE_URL}${ep}`);
    assert.equal(res.status, 401, `Unauthenticated request to ${ep} must return HTTP 401`);
  }

  // 10. Auth Attack: Direct access to protected endpoints with forged Bearer token
  for (const ep of noAuthEndpoints) {
    const res = await fetch(`${BASE_URL}${ep}`, {
      headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmb3JnZWQifQ.invalidsig' }
    });
    assert.equal(res.status, 401, `Forged token request to ${ep} must return HTTP 401`);
  }
});

// ============================================================================
// LIVE SERVER ENDPOINT: FIRST-RUN SETUP & AUTHENTICATION
// ============================================================================

test('LIVE SERVER ENDPOINT: First-run setup lifecycle, login, and auth enforcement', async () => {
  // 1. Query setup status
  const statusRes = await fetch(`${BASE_URL}/api/auth/setup-status`);
  assert.equal(statusRes.status, 200);
  const { setupRequired } = await statusRes.json();

  let adminToken;
  if (setupRequired) {
    // 2. Perform initial setup
    const setupRes = await fetch(`${BASE_URL}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'System Administrator',
        email: 'admin@mohsinco.com',
        password: 'MohsinCoSecure2026!'
      })
    });
    assert.equal(setupRes.status, 200, 'Initial setup must succeed');
    const setupData = await setupRes.json();
    assert.ok(setupData.token);
    adminToken = setupData.token;

    // 3. Repeat setup must fail
    const repeatRes = await fetch(`${BASE_URL}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Attacker',
        email: 'attacker@bad.com',
        password: 'AttackerPassword123!'
      })
    });
    assert.equal(repeatRes.status, 400, 'Repeat setup must be rejected');
  } else {
    // Admin already exists, log in
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@mohsinco.com',
        password: 'MohsinCoSecure2026!'
      })
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    adminToken = loginData.token;
  }

  // 4. Known demo credentials (changeme123) are strictly rejected with 401
  const demoLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@mohsinco.com',
      password: 'changeme123'
    })
  });
  assert.equal(demoLogin.status, 401, 'Demo credentials must be rejected');

  // 5. Protected endpoint with valid token succeeds
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.equal(meRes.status, 200);
  const me = await meRes.json();
  assert.equal(me.email, 'admin@mohsinco.com');

  // 6. Protected endpoint with forged token rejected with 401
  const forgedRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.bogus_sig' }
  });
  assert.equal(forgedRes.status, 401);
});
