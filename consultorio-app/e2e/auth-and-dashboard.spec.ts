import { test, expect } from '@playwright/test';
import { loginAsDoctor, logout } from './helpers/auth';

test.describe('Auth & Dashboard', () => {
  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await loginAsDoctor(page);

    await expect(page).toHaveURL(/\/medico\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('dashboard shows stats cards', async ({ page }) => {
    await loginAsDoctor(page);

    await expect(page.getByText('Total Hoy')).toBeVisible();
    await expect(page.getByText('Pendientes').first()).toBeVisible();
    await expect(page.getByText('Confirmadas').first()).toBeVisible();
    await expect(page.getByText('Completadas').first()).toBeVisible();
  });

  test('dashboard shows today appointments section', async ({ page }) => {
    await loginAsDoctor(page);

    await expect(page.getByRole('heading', { name: 'Citas de Hoy' })).toBeVisible();
  });

  test('logout clears session', async ({ page }) => {
    await loginAsDoctor(page);
    await logout(page);

    // Trying to access a protected page should redirect to login
    await page.goto('/medico/dashboard');
    await page.waitForURL(/\/medico\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/medico\/login/);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/medico/login');

    await page.getByPlaceholder('admin@consultorio.com').fill('wrong@email.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByText(/credenciales inválidas/i)).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/medico\/login/);
  });
});
