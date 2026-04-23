import { test, expect } from '@playwright/test';
import { loginAsDoctor } from './helpers/auth';
import { TEST_PATIENT } from './helpers/seed-data';

test.describe('Patient Directory', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDoctor(page);
  });

  test('patient directory page loads', async ({ page }) => {
    await page.goto('/medico/pacientes');

    await expect(
      page.getByRole('heading', { name: 'Directorio de Pacientes' })
    ).toBeVisible();
  });

  test('create patient via modal', async ({ page }) => {
    await page.goto('/medico/pacientes');

    // Open create modal
    await page.getByRole('button', { name: 'Nuevo paciente' }).click();
    await expect(page.getByText('Crear paciente')).toBeVisible();

    const inputByLabel = (label: string) =>
      page
        .locator('label', { hasText: label })
        .first()
        .locator('xpath=following-sibling::input');

    // Fill form
    const uniquePhone = `55${Date.now().toString().slice(-8)}`;
    await inputByLabel('Nombre(s)').fill(TEST_PATIENT.firstName);
    await inputByLabel('Apellido paterno').fill(TEST_PATIENT.lastNamePaternal);
    await inputByLabel('Apellido materno').fill(TEST_PATIENT.lastNameMaternal);
    await inputByLabel('Teléfono').fill(uniquePhone);

    // Submit
    await page.getByRole('button', { name: 'Guardar paciente' }).click();

    // Should navigate to patient detail
    await page.waitForURL(/\/medico\/pacientes\//, { timeout: 10_000 });
  });

  test('search filters patients', async ({ page }) => {
    await page.goto('/medico/pacientes');

    // Wait for patients to load
    await page.waitForTimeout(1_000);

    // Type in search
    await page
      .getByPlaceholder('Buscar por nombre o teléfono...')
      .fill('zzz-nonexistent-name');

    // Should show empty state
    await expect(page.getByText('No se encontraron pacientes')).toBeVisible();
  });
});
