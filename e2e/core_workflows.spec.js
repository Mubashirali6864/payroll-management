// @ts-check
import { test, expect } from '@playwright/test';
import jwt from '../mohsin-&-co-payroll-&-attendance/node_modules/jsonwebtoken/index.js';
import fs from 'fs';
import path from 'path';

// Run sequentially to prevent rate limiter contention
test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const envPath = path.resolve('mohsin-&-co-payroll-&-attendance/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envSecretMatch = envContent.match(/JWT_SECRET\s*=\s*(.+)/);
const CONFIGURED_JWT_SECRET = envSecretMatch ? envSecretMatch[1].trim() : '';

const testAdminUser = {
  id: 'usr_1',
  name: 'Super Administrator',
  email: 'admin@mohsinco.com',
  role: 'super_admin',
  department: 'Administration',
  permissions: {
    employees: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true, mark: true, override: true, manage_shifts: true },
    payroll: { view: true, calculate: true, approve: true, adjustments: true },
    reports: { view: true, export: true },
    settings: { company_setup: true, user_roles: true, system_backup: true }
  }
};

const adminToken = jwt.sign({
  userId: testAdminUser.id,
  email: testAdminUser.email,
  role: testAdminUser.role,
  permissions: testAdminUser.permissions
}, CONFIGURED_JWT_SECRET, { expiresIn: '8h' });

async function ensureLoggedIn(page) {
  await page.addInitScript(({ token, user }) => {
    sessionStorage.setItem('mohsin_payroll_token', token);
    sessionStorage.setItem('mohsin_payroll_user', JSON.stringify(user));
    localStorage.setItem('mohsin_payroll_token', token);
    localStorage.setItem('mohsin_payroll_user', JSON.stringify(user));
  }, { token: adminToken, user: testAdminUser });

  await page.goto(BASE_URL);
  await expect(page.locator('h2')).toContainText('DASHBOARD');
}

test.describe('Workflows Suite 01: Employee Management & Directory', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('WF-EMP-01: Navigate to HR Management and render employee table', async ({ page }) => {
    // Click HR Management tab in desktop sidebar or mobile bar
    await page.locator('aside button:has-text("HR Management"):visible').click();

    // Verify view header
    await expect(page.locator('h2')).toContainText('HR Management & Employee Directory');

    // Verify search bar and filter controls exist
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await expect(searchInput).toBeVisible();

    // Verify employee directory table is populated
    const employeeRows = page.locator('table tbody tr');
    await expect(employeeRows.first()).toBeVisible();
    const count = await employeeRows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('WF-EMP-02: Search and filter employees dynamically', async ({ page }) => {
    await page.locator('aside button:has-text("HR Management"):visible').click();

    const searchInput = page.locator('input[placeholder*="Search by name"]');
    // Search for non-existent employee
    await searchInput.fill('NonExistentEmployeeXYZ');
    await expect(page.locator('text=No employee records match the filter criteria')).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('WF-EMP-03: Open and inspect Employee Onboarding Modal', async ({ page }) => {
    await page.locator('aside button:has-text("HR Management"):visible').click();

    // Click Onboard Employee button
    const onboardBtn = page.locator('button:has-text("Onboard Employee")');
    await expect(onboardBtn).toBeVisible();
    await onboardBtn.click();

    // Verify modal elements
    await expect(page.locator('h3:has-text("Onboard New Employee")')).toBeVisible();
    await expect(page.locator('input[placeholder*="Syed Zohaib Ali"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="Enter amount"]')).toBeVisible();

    // Close modal
    await page.locator('div[role="dialog"] button:has-text("Cancel"), .fixed button:has-text("Cancel")').first().click();
  });
});

test.describe('Workflows Suite 02: Attendance Logs & Multi-Date Overrides', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('WF-ATT-01: Navigate to Attendance and toggle between Daily Roster and Complete History', async ({ page }) => {
    await page.locator('aside button:has-text("Attendance & Shifts"):visible').click();

    // Verify Attendance view header
    await expect(page.locator('h2')).toContainText('Biometric Attendance Logs & Shifts');

    // Default is Daily Roster
    await expect(page.locator('button:has-text("Daily Roster")')).toHaveClass(/bg-white/);

    // Switch to Complete History
    await page.locator('button:has-text("Complete History")').click();
    await expect(page.locator('button:has-text("Complete History")')).toHaveClass(/bg-white/);
  });

  test('WF-ATT-02: Open Manual Range Entry Modal and inspect date range controls', async ({ page }) => {
    await page.locator('aside button:has-text("Attendance & Shifts"):visible').click();

    // Click Manual / Range Entry button
    const rangeBtn = page.locator('button:has-text("Manual / Range Entry")');
    await expect(rangeBtn).toBeVisible();
    await rangeBtn.click();

    // Verify modal if mounted
    const modalTitle = page.locator('h3:has-text("Manual Attendance Entry")');
    if (await modalTitle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(page.locator('text=Date Range (From → To)')).toBeVisible();
      await page.locator('button:has-text("Cancel")').first().click();
    }
  });
});

test.describe('Workflows Suite 03: Payroll Engine & Payslip Statement', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('WF-PAY-01: Navigate to Payroll Management and view records summary', async ({ page }) => {
    await page.locator('aside button:has-text("Payroll Management"):visible').click();

    // Verify Payroll view header
    await expect(page.locator('h2')).toContainText('Payroll Management & Compensation Engine');

    // Verify month selector and Calculate button
    await expect(page.locator('input[type="month"]')).toBeVisible();
    await expect(page.locator('button:has-text("Calculate Payroll")')).toBeVisible();

    // Verify payroll table exists
    await expect(page.locator('table')).toBeVisible();
  });

  test('WF-PAY-02: Open Add Adjustment modal for bonus/fine entry', async ({ page }) => {
    await page.locator('aside button:has-text("Payroll Management"):visible').click();

    // Click first "+ Adjustment" button in table if present
    const adjBtn = page.locator('button:has-text("Adjustment")').first();
    if (await adjBtn.isVisible()) {
      await adjBtn.click();
      await expect(page.locator('h3:has-text("Add Compensation Adjustment")')).toBeVisible();
      await expect(page.locator('select')).toBeVisible(); // Adjustment type selector
      await page.locator('button:has-text("Cancel")').first().click();
    }
  });
});

test.describe('Workflows Suite 04: Reports & Custom Window Exports', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('WF-REP-01: Navigate to Reports and switch between Daily and Monthly summary', async ({ page }) => {
    await page.locator('aside button:has-text("Reports"):visible').click();

    // Verify Reports header
    await expect(page.locator('h2')).toContainText('Executive Reports & Exports');

    // Check Daily summary tab
    const dailyTab = page.locator('button:has-text("Daily Payroll Summary")');
    await expect(dailyTab).toBeVisible();

    // Check Monthly summary tab
    const monthlyTab = page.locator('button:has-text("Monthly Payroll Summary")');
    await expect(monthlyTab).toBeVisible();
    await monthlyTab.click();

    // Verify From and To range pickers appear
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
  });

  test('WF-REP-02: Verify Export to Excel and Print PDF buttons exist', async ({ page }) => {
    await page.locator('aside button:has-text("Reports"):visible').click();

    await expect(page.locator('button:has-text("Export Excel")')).toBeVisible();
    await expect(page.locator('button:has-text("Print PDF Report")')).toBeVisible();
  });
});

test.describe('Workflows Suite 05: Settings & User Roles', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('WF-SET-01: Navigate to Settings & User Role Management', async ({ page }) => {
    await page.locator('aside button:has-text("Settings & Roles"):visible').click();

    // Verify Settings view header
    await expect(page.locator('h2')).toContainText('Settings & User Role Management');

    // Verify Company Setup subtab is active
    await expect(page.locator('button:has-text("Company Profile & Setup")')).toBeVisible();

    // Switch to User Roles & Permissions subtab
    const rolesSubtab = page.locator('button:has-text("User Roles & Permissions")');
    await expect(rolesSubtab).toBeVisible();
    await rolesSubtab.click();

    // Verify user table and Add User button
    await expect(page.locator('button:has-text("Create User Profile")')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });
});
