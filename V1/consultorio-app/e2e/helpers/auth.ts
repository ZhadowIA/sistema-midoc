import { type Page, expect } from '@playwright/test';
import { DOCTOR } from './seed-data';

let cachedDoctorCookies: Awaited<ReturnType<Page['context']>> extends never
  ? never
  : Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'Strict' | 'Lax' | 'None';
    }> | null = null;

/**
 * Logs in as the seeded doctor and waits for navigation to complete.
 * After this, the page should be on /medico/dashboard (or onboarding/subscription).
 */
export async function loginAsDoctor(page: Page): Promise<void> {
  if (cachedDoctorCookies && cachedDoctorCookies.length > 0) {
    await page.context().addCookies(cachedDoctorCookies);
    await page.goto('/medico/dashboard');
    if (!page.url().includes('/medico/login')) return;
  }

  await page.goto('/medico/login');

  const emailInput = page.getByPlaceholder('admin@consultorio.com');
  const passwordInput = page.getByPlaceholder('••••••••');
  const submitButton = page.getByRole('button', { name: 'Iniciar sesión' });
  const rateLimitMessage = page.getByText('Demasiadas solicitudes', { exact: false });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await emailInput.fill(DOCTOR.email);
    await passwordInput.fill(DOCTOR.password);
    await submitButton.click();

    try {
      // Post-login destination can vary by account state/feature flags.
      await page.waitForURL(
        (url) => url.pathname.startsWith('/medico') && !url.pathname.startsWith('/medico/login'),
        { timeout: 6_000 },
      );
      cachedDoctorCookies = await page.context().cookies();
      return;
    } catch {
      const throttled = await rateLimitMessage.isVisible().catch(() => false);
      if (throttled && attempt < 3) {
        await page.waitForTimeout(2_000);
        continue;
      }
    }
  }

  throw new Error(
    'No se pudo iniciar sesión en E2E (rate limit activo o credenciales inválidas). Si usas servidor ya levantado, habilita E2E_TEST_MODE=1.',
  );
}

/**
 * Logs out from the doctor panel by calling the API directly.
 * This avoids navigating through UI to find a logout button.
 */
export async function logout(page: Page): Promise<void> {
  const response = await page.request.post('/api/auth/logout');
  expect(response.status()).toBeLessThan(400);
}
