// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Authentication & Navigation Suite', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  test('TC-AUTH-01: Login screen does NOT display hardcoded production credentials (BLOCKER-01 Remediated)', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check header branding
    await expect(page.locator('h1')).toContainText('Mohsin & Co.');

    // Verify email input does NOT have pre-filled default credential
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveValue('');

    // Verify password input does NOT have pre-filled default credential
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveValue('');

    // Verify default credentials notice is NOT visible
    const credentialsFooter = page.locator('text=admin@mohsinco.com / changeme123');
    await expect(credentialsFooter).toBeHidden();
  });

  test('TC-AUTH-02: Invalid login displays validation error message', async ({ page }) => {
    await page.goto(BASE_URL);

    // Fill invalid credentials
    await page.locator('input[type="email"]').fill('wrong@mohsinco.com');
    await page.locator('input[type="password"]').fill('badpassword');
    await page.locator('button[type="submit"]').click();

    // Verify error banner appears
    const errorBanner = page.locator('.bg-rose-50');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/Invalid credentials|failed|Too many login attempts/i);
  });

  test('TC-AUTH-03: Valid login authenticates and mounts Dashboard view', async ({ page }) => {
    await page.goto(BASE_URL);

    // Fill configured administrator credentials
    await page.locator('input[type="email"]').fill('admin@mohsinco.com');
    await page.locator('input[type="password"]').fill('MohsinCoSecure2026!');
    await page.locator('button[type="submit"]').click();

    // Verify Dashboard navigation
    await expect(page.locator('h2')).toContainText('DASHBOARD');
    await expect(page.locator('text=Monthly Staff')).toBeVisible();
    await expect(page.locator('text=Present Today')).toBeVisible();
  });

  test('TC-AUTH-04: Verify Dark-to-Light FOUC defect (BUG-12)', async ({ page }) => {
    await page.goto(BASE_URL);

    // Inspect body class
    const bodyClass = await page.evaluate(() => document.body.className);
    expect(bodyClass).toContain('bg-[#0b0f19]'); // Dark mode background

    // Inspect root div class
    const rootClass = await page.evaluate(() => {
      const root = document.querySelector('#root > div');
      return root ? root.className : '';
    });
    // Inconsistent root background class
    expect(rootClass).toContain('bg-[#f0f2f5]');
  });
});
