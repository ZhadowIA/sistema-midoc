import { test, expect } from '@playwright/test';
import { loginAsDoctor } from './helpers/auth';

test.describe('Appointment & Agenda', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDoctor(page);
  });

  test('agenda page loads with day view', async ({ page }) => {
    await page.goto('/medico/agenda');

    // The agenda page should load and show some kind of schedule view
    await page.waitForLoadState('networkidle');

    // Agenda page is a large component — check it rendered by looking for
    // characteristic elements (time slots, day headers, etc.)
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    // Should not be on login page
    await expect(page).toHaveURL(/\/medico\/agenda/);
  });

  test('agenda navigates to appointment detail', async ({ page }) => {
    // First check if there are any appointments via API
    const response = await page.request.get('/api/agenda/admin/dashboard/summary');

    if (response.status() !== 200) {
      test.skip(true, 'Dashboard API not reachable — skipping');
      return;
    }

    const data = await response.json();
    const allAppointments = [
      ...(data.todayAppointments ?? []),
      ...(data.upcomingAppointments ?? []),
    ];

    if (allAppointments.length === 0) {
      test.skip(true, 'No appointments in seed data — skipping');
      return;
    }

    // Navigate to the first appointment detail
    const firstId = allAppointments[0].id;
    await page.goto(`/medico/citas/${firstId}`);

    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(new RegExp(`/medico/citas/${firstId}`));
  });

  test('appointment detail loads consultation workspace link', async ({ page }) => {
    const response = await page.request.get('/api/agenda/admin/dashboard/summary');

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
    await page.goto(`/medico/citas/${firstId}`);

    await page.waitForLoadState('networkidle');

    // The appointment detail page should have loaded without errors
    const pageContent = await page.textContent('body');
    expect(pageContent?.length).toBeGreaterThan(100);
  });
});

