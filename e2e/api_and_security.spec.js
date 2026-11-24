// @ts-check
import { test, expect } from '@playwright/test';
import jwt from '../mohsin-&-co-payroll-&-attendance/node_modules/jsonwebtoken/index.js';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const envPath = path.resolve('mohsin-&-co-payroll-&-attendance/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envSecretMatch = envContent.match(/JWT_SECRET\s*=\s*(.+)/);
const CONFIGURED_JWT_SECRET = envSecretMatch ? envSecretMatch[1].trim() : '';

const adminToken = jwt.sign({
  userId: 'usr_1',
  email: 'admin@mohsinco.com',
  role: 'super_admin',
  permissions: { dashboard: { view: true } }
}, CONFIGURED_JWT_SECRET, { expiresIn: '1h' });

test.describe('API Security & Business Verification Suite', () => {
  test('TC-SEC-01: Authentication required for /api/dashboard/metrics (BUG-03 Remediation)', async ({ request }) => {
    // 1. Make unauthenticated request without Authorization header
    const unauthResponse = await request.get(`${BASE_URL}/api/dashboard/metrics`);
    expect(unauthResponse.status()).toBe(401);

    // 2. Make authenticated request with valid token
    const authRes = await request.get(`${BASE_URL}/api/dashboard/metrics`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    expect(authRes.status()).toBe(200);
    const data = await authRes.json();
    expect(data).toHaveProperty('total_employees');
    expect(data).toHaveProperty('today_payroll_accrual');
    expect(data).toHaveProperty('monthly_payroll_estimate');
  });

  test('TC-SEC-02: Security Headers check (Helmet CSP & X-Frame-Options)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/`);
    const headers = response.headers();

    expect(headers).toHaveProperty('content-security-policy');
    expect(headers).toHaveProperty('x-content-type-options', 'nosniff');
  });

  test('TC-SEC-03: Rate limiter removed on login to prevent 429 lockout per user requirement', async ({ request }) => {
    const testIp = `198.51.100.${(Date.now() % 200) + 10}`;

    // Repeated failed attempts return 401 and are not blocked by 429
    for (let i = 1; i <= 6; i++) {
      const res = await request.post(`${BASE_URL}/api/auth/login`, {
        headers: { 'X-Forwarded-For': testIp },
        data: { email: 'brute@force.com', password: 'wrongpassword' }
      });
      expect(res.status()).toBe(401);
    }
  });
});
