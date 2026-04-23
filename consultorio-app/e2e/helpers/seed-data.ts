/**
 * Seed data constants for E2E tests.
 * These must match the values in prisma/seed.ts.
 */
export const DOCTOR = {
  email: 'admin@consultorio.com',
  password: 'admin123',
  name: 'Admin',
} as const;

export const TEST_PATIENT = {
  firstName: 'E2E',
  lastNamePaternal: 'Prueba',
  lastNameMaternal: 'Auto',
  phone: '5500000001',
  email: 'e2e-test@example.com',
  dateOfBirth: '1990-06-15',
} as const;
