import { expect, Page, test } from '@playwright/test'

const doctorId = 'cma1234567890123456789012'
const holdToken = '550e8400-e29b-41d4-a716-446655440000'

function buildSlotStart(date: string) {
  return `${date}T10:00:00.000-07:00`
}

function buildSlotEnd(date: string) {
  return `${date}T10:30:00.000-07:00`
}

function pickAvailableDateFromRange(startDate: string, endDate: string) {
  const endExclusive = new Date(`${endDate}T00:00:00`)
  endExclusive.setDate(endExclusive.getDate() - 2)
  return endExclusive.toISOString().slice(0, 10)
}

async function setupBookingMocks(
  page: Page,
  options?: {
    appointmentHandler?: (payload: Record<string, unknown>) => unknown
    authPayload?: Record<string, unknown>
  }
) {
  let appointmentPayload: Record<string, unknown> | null = null
  let availableDate = '2026-05-01'

  await page.route('**/api/auth/patient/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options?.authPayload ?? { authenticated: false }),
    })
  })

  await page.route('**/api/agenda/public/doctors?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: doctorId,
        name: 'Dra. Demo',
        specialty: 'Pediatría',
        slug: 'dra-demo',
      }),
    })
  })

  await page.route('**/api/agenda/public/availability/month?**', async (route) => {
    const url = new URL(route.request().url())
    const startDate = url.searchParams.get('startDate') ?? availableDate
    const endDate = url.searchParams.get('endDate') ?? startDate
    availableDate = pickAvailableDateFromRange(startDate, endDate)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ dates: [availableDate] }),
    })
  })

  await page.route('**/api/agenda/public/availability?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slots: [{ start: buildSlotStart(availableDate), end: buildSlotEnd(availableDate), type: 'normal' }],
      }),
    })
  })

  await page.route('**/api/agenda/public/availability/hold', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          holdToken,
          startTime: buildSlotStart(availableDate),
          expiresAt: '2099-05-01T09:15:00.000-07:00',
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.route('**/api/agenda/public/appointments', async (route) => {
    appointmentPayload = route.request().postDataJSON() as Record<string, unknown>

    if (options?.appointmentHandler) {
      const response = options.appointmentHandler(appointmentPayload)
      await route.fulfill(response as Parameters<typeof route.fulfill>[0])
      return
    }

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        appointmentId: 'apt_demo',
        status: 'PENDING',
        appointment: {
          id: 'apt_demo',
          startTime: buildSlotStart(availableDate),
          endTime: buildSlotEnd(availableDate),
          appointmentType: 'NORMAL',
          durationMin: 30,
          doctor: {
            id: doctorId,
            name: 'Dra. Demo',
            specialty: 'Pediatría',
            clinicAddress: null,
          },
        },
        questionnaire: {
          recommended: true,
          optional: true,
          url: 'https://example.com/cuestionario-demo',
        },
      }),
    })
  })

  return {
    getAppointmentPayload: () => appointmentPayload,
    getAvailableDate: () => availableDate,
  }
}

async function completeGuestBookingUntilConfirm(page: Page, availableDateRef: () => string) {
  await page.goto('/agendar?doctor=dra-demo')

  await expect(page.getByText('Bienvenido')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar como Invitado' }).click()

  await expect(page.getByRole('heading', { name: 'Tipo de consulta' })).toBeVisible()
  await page.getByText('Consulta Normal').click()
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Selecciona una fecha' })).toBeVisible()
  await expect.poll(() => availableDateRef()).not.toBe('')
  await page.getByTestId(`booking-date-${availableDateRef()}`).click()

  await expect(page.getByRole('heading', { name: 'Selecciona un horario' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  await page.getByTestId('booking-time-10:00').click()
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeEnabled()
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Datos para la cita' })).toBeVisible()
  await page.getByPlaceholder('Ej. María Fernanda').fill('Sofía')
  await page.getByPlaceholder('Ej. González').fill('Ramírez')
  await page.locator('input[type="date"]').fill('2018-05-10')
  await page.getByTestId('booking-sex-select').click()
  await page.getByRole('option', { name: 'Mujer' }).click()
  await page.getByRole('button', { name: 'Usar mismo nombre del paciente' }).click()
  await page.getByTestId('booking-relation-select').click()
  await page.getByRole('option', { name: 'Cuidador(a)' }).click()
  await page.getByPlaceholder('10 dígitos').fill('6141234567')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Revisión de Reserva' })).toBeVisible()
}

async function completeLinkedBookingToInfo(page: Page, availableDateRef: () => string) {
  await page.goto('/agendar?doctor=dra-demo')

  await expect(page.getByRole('heading', { name: 'Has iniciado sesión' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar con esta cuenta' }).click()

  await expect(page.getByRole('heading', { name: 'Tipo de consulta' })).toBeVisible()
  await page.getByText('Consulta Normal').click()
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Selecciona una fecha' })).toBeVisible()
  await expect.poll(() => availableDateRef()).not.toBe('')
  await page.getByTestId(`booking-date-${availableDateRef()}`).click()

  await expect(page.getByRole('heading', { name: 'Selecciona un horario' })).toBeVisible()
  await page.getByTestId('booking-time-10:00').click()
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Datos para la cita' })).toBeVisible()
}

test('guest booking flow allows patient without own phone and uses responsible contact', async ({ page }) => {
  const booking = await setupBookingMocks(page)

  await completeGuestBookingUntilConfirm(page, booking.getAvailableDate)
  await page.getByRole('button', { name: 'Confirmar Reserva' }).click()

  await expect.poll(() => booking.getAppointmentPayload()).not.toBeNull()
  expect(booking.getAppointmentPayload()).toMatchObject({
    firstName: 'Sofía',
    lastNamePaternal: 'Ramírez',
    dateOfBirth: '2018-05-10',
    sex: 'FEMALE',
    appointmentType: 'NORMAL',
    startTime: buildSlotStart(booking.getAvailableDate()),
    doctorId,
    holdToken,
    privacyConsentAccepted: true,
    contact: {
      relation: 'CAREGIVER',
      firstName: 'Sofía',
      lastNamePaternal: 'Ramírez',
      phone: '6141234567',
    },
  })
  expect(booking.getAppointmentPayload()).not.toHaveProperty('phone')
  await expect(page).toHaveURL(/\/confirmacion\?cuestionario=/)
})

test('booking flow shows backend validation detail when appointment creation fails', async ({ page }) => {
  const booking = await setupBookingMocks(page, {
    appointmentHandler: () => ({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Datos inválidos',
        details: [{ message: 'El horario seleccionado ya no está disponible.' }],
      }),
    }),
  })

  await completeGuestBookingUntilConfirm(page, booking.getAvailableDate)
  await page.getByRole('button', { name: 'Confirmar Reserva' }).click()

  await expect.poll(() => booking.getAppointmentPayload()).not.toBeNull()
  await expect(page.getByText('El horario seleccionado ya no está disponible.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Revisión de Reserva' })).toBeVisible()
})

test('linked-account flow requires email before allowing continue from info step', async ({ page }) => {
  const booking = await setupBookingMocks(page, {
    authPayload: {
      authenticated: true,
      user: {
        id: 'pat_user_1',
        name: 'Sofía Ramírez',
        email: '',
        role: 'PATIENT',
      },
      profile: {
        id: 'pat_1',
        firstName: 'Sofía',
        lastNamePaternal: 'Ramírez',
        lastNameMaternal: '',
        phone: '',
        email: '',
        dateOfBirth: '2018-05-10',
      },
    },
  })

  await completeLinkedBookingToInfo(page, booking.getAvailableDate)

  await page.getByTestId('booking-sex-select').click()
  await page.getByRole('option', { name: 'Mujer' }).click()
  await page.getByRole('button', { name: 'Usar mismo nombre del paciente' }).click()
  await page.getByTestId('booking-relation-select').click()
  await page.getByRole('option', { name: 'Cuidador(a)' }).click()
  await page.getByPlaceholder('10 dígitos').fill('6141234567')
  await page.getByRole('checkbox').check()

  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled()

  const emailInput = page.locator('input[type="email"]').last()
  await emailInput.fill('responsable@example.com')
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeEnabled()
})
