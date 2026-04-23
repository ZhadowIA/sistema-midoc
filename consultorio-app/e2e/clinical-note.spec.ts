import { test, expect } from '@playwright/test';
import { loginAsDoctor } from './helpers/auth';

test.describe('Clinical Note (SOAP)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDoctor(page);
  });

  test('consultation workspace loads for an appointment', async ({ page }) => {
    // Find an appointment via API
    const response = await page.request.get('/api/admin/dashboard/summary');

    if (response.status() !== 200) {
      test.skip(true, 'Dashboard API not reachable');
      return;
    }

    const data = await response.json();
    const allAppointments = [
      ...(data.todayAppointments ?? []),
      ...(data.upcomingAppointments ?? []),
    ];

    if (allAppointments.length === 0) {
      test.skip(true, 'No appointments in seed data — cannot test consultation');
      return;
    }

    const firstId = allAppointments[0].id;

    // Navigate to consultation workspace
    await page.goto(`/medico/citas/${firstId}/consulta`);
    await page.waitForLoadState('networkidle');

    // Should be on the consultation page
    await expect(page).toHaveURL(new RegExp(`/medico/citas/${firstId}/consulta`));

    // The workspace should have rendered some clinical content
    const pageContent = await page.textContent('body');
    expect(pageContent?.length).toBeGreaterThan(100);
  });

  test('SOAP note can be saved via API', async ({ page }) => {
    // Find an appointment via API
    const response = await page.request.get('/api/admin/dashboard/summary');

    if (response.status() !== 200) {
      test.skip(true, 'Dashboard API not reachable');
      return;
    }

    const data = await response.json();
    const allAppointments = [
      ...(data.todayAppointments ?? []),
      ...(data.upcomingAppointments ?? []),
    ];

    if (allAppointments.length === 0) {
      test.skip(true, 'No appointments in seed data');
      return;
    }

    const firstId = allAppointments[0].id;

    // Save a SOAP note via API directly
    const noteResponse = await page.request.post(
      `/api/admin/appointments/${firstId}/note`,
      {
        data: {
          subjective: 'E2E test — paciente refiere dolor de cabeza leve.',
          objective: 'E2E test — signos vitales normales.',
          assessment: 'E2E test — cefalea tensional.',
          plan: 'E2E test — paracetamol 500mg cada 8 horas por 3 días.',
        },
      }
    );

    // Accept both 200 (updated) and 201 (created)
    expect([200, 201]).toContain(noteResponse.status());

    const noteData = await noteResponse.json();
    expect(noteData).toBeTruthy();
  });
});
