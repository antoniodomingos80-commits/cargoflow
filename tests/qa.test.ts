import { test, expect } from '@playwright/test';

test('Landing Page Loads', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page).toHaveTitle(/Cargo/i);
});

test('Registo Page Works', async ({ page }) => {
  await page.goto('http://localhost:3000/registo');
  await expect(page).toHaveURL(/registo/);
});

test('Route Protection Active', async ({ page }) => {
  await page.goto('http://localhost:3000/painel');
  await expect(page).toHaveURL(/entrar/, { timeout: 5000 });
});

test('Entrar Page Loads', async ({ page }) => {
  await page.goto('http://localhost:3000/entrar');
  await expect(page.locator('input[type=email]')).toBeVisible();
});
