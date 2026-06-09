import assert from 'node:assert/strict'
import {
  ContractValidationError,
  parseAvailabilityDayQuery,
  parseAvailabilityMonthQuery,
  parsePublicAppointmentPayload,
} from '../../lib/publicApiContracts.ts'
import {
  GENDER_OPTIONS,
  PATIENT_GENDER_VALUES,
  PATIENT_RELATION_VALUES,
  PATIENT_SEX_VALUES,
  RELATION_OPTIONS,
  SEX_OPTIONS,
} from '../../lib/bookingOptions.ts'
import { runSuite } from '../testHarness.ts'

const validDoctorId = 'cma1234567890123456789012'

export async function runPublicContractsIntegrationTests() {
  await runSuite('Integration: public API contracts (availability + appointments)', [
    {
      name: 'availability day contract accepts valid day params',
      run: () => {
        const result = parseAvailabilityDayQuery({
          date: '2026-04-14',
          type: 'normal',
          doctorId: validDoctorId,
        })

        assert.equal(result.date, '2026-04-14')
        assert.equal(result.type, 'normal')
      },
    },
    {
      name: 'availability day contract rejects invalid calendar date',
      run: () => {
        assert.throws(
          () =>
            parseAvailabilityDayQuery({
              date: '2026-02-31',
              type: 'normal',
              doctorId: validDoctorId,
            }),
          (error: unknown) =>
            error instanceof ContractValidationError && error.message.includes('Fecha inválida')
        )
      },
    },
    {
      name: 'availability month contract rejects ranges larger than allowed',
      run: () => {
        assert.throws(
          () =>
            parseAvailabilityMonthQuery({
              startDate: '2026-01-01',
              endDate: '2026-04-15',
              type: 'extended',
              doctorId: validDoctorId,
            }),
          (error: unknown) =>
            error instanceof ContractValidationError && error.message.includes('Rango inválido')
        )
      },
    },
    {
      name: 'shared booking enums keep frontend options aligned with public contract values',
      run: () => {
        assert.deepEqual(
          SEX_OPTIONS.map((option) => option.value),
          [...PATIENT_SEX_VALUES]
        )
        assert.deepEqual(
          GENDER_OPTIONS.map((option) => option.value),
          [...PATIENT_GENDER_VALUES]
        )
        assert.deepEqual(
          RELATION_OPTIONS.map((option) => option.value),
          [...PATIENT_RELATION_VALUES]
        )
      },
    },
    {
      name: 'appointments contract requires structured fields and normalizes phone',
      run: () => {
        const payload = parsePublicAppointmentPayload({
          firstName: 'Ana',
          lastNamePaternal: 'López',
          lastNameMaternal: 'Gómez',
          dateOfBirth: '1995-07-10',
          phone: '(614) 123-45-67',
          email: 'ana@example.com',
          appointmentType: 'NORMAL',
          startTime: '2026-05-01T10:00:00.000-07:00',
          doctorId: validDoctorId,
          privacyConsentAccepted: true,
        })

        assert.equal(payload.fullName, 'Ana López Gómez')
        assert.equal(payload.phone, '6141234567')
        assert.equal(payload.firstName, 'Ana')
        assert.equal(payload.lastNamePaternal, 'López')
        assert.equal(payload.lastNameMaternal, 'Gómez')
      },
    },
    {
      name: 'appointments contract accepts structured fields and builds fullName',
      run: () => {
        const payload = parsePublicAppointmentPayload({
          firstName: 'Ana',
          lastNamePaternal: 'López',
          sex: 'FEMALE',
          gender: 'FEMININE',
          dateOfBirth: '1995-07-10',
          phone: '6141234567',
          appointmentType: 'NORMAL',
          startTime: '2026-05-01T10:00:00.000-07:00',
          doctorId: validDoctorId,
          privacyConsentAccepted: true,
          contact: {
            relation: 'SELF',
            firstName: 'Ana',
            lastNamePaternal: 'López',
            phone: '6141234567',
          },
        })

        assert.equal(payload.fullName, 'Ana López')
        assert.equal(payload.lastNameMaternal, null)
        assert.equal(payload.sex, 'FEMALE')
        assert.equal(payload.gender, 'FEMININE')
        assert.equal(payload.contact?.relation, 'SELF')
        assert.equal(payload.contact?.phone, '6141234567')
      },
    },
    {
      name: 'appointments contract allows missing patient phone when responsible contact has phone',
      run: () => {
        const payload = parsePublicAppointmentPayload({
          firstName: 'Ana',
          lastNamePaternal: 'López',
          dateOfBirth: '1995-07-10',
          phone: '',
          appointmentType: 'NORMAL',
          startTime: '2026-05-01T10:00:00.000-07:00',
          doctorId: validDoctorId,
          privacyConsentAccepted: true,
          contact: {
            relation: 'CAREGIVER',
            firstName: 'Laura',
            lastNamePaternal: 'Pérez',
            phone: '6141234567',
          },
        })

        assert.equal(payload.phone, '')
        assert.equal(payload.contact?.phone, '6141234567')
      },
    },
    {
      name: 'appointments contract rejects missing lastNamePaternal when structured',
      run: () => {
        assert.throws(
          () =>
            parsePublicAppointmentPayload({
              firstName: 'Ana',
              dateOfBirth: '1995-07-10',
              phone: '6141234567',
              appointmentType: 'NORMAL',
              startTime: '2026-05-01T10:00:00.000-07:00',
              doctorId: validDoctorId,
              privacyConsentAccepted: true,
            }),
          (error: unknown) => error instanceof ContractValidationError
        )
      },
    },
    {
      name: 'appointments contract rejects payload without required structured names',
      run: () => {
        assert.throws(
          () =>
            parsePublicAppointmentPayload({
              dateOfBirth: '1995-07-10',
              phone: '6141234567',
              appointmentType: 'NORMAL',
              startTime: '2026-05-01T10:00:00.000-07:00',
              doctorId: validDoctorId,
              privacyConsentAccepted: true,
            }),
          (error: unknown) => error instanceof ContractValidationError
        )
      },
    },
    {
      name: 'appointments contract validates contact phone format',
      run: () => {
        assert.throws(
          () =>
            parsePublicAppointmentPayload({
              firstName: 'Ana',
              lastNamePaternal: 'López',
              dateOfBirth: '1995-07-10',
              phone: '6141234567',
              appointmentType: 'NORMAL',
              startTime: '2026-05-01T10:00:00.000-07:00',
              doctorId: validDoctorId,
              privacyConsentAccepted: true,
              contact: {
                relation: 'SPOUSE',
                firstName: 'Juan',
                lastNamePaternal: 'Pérez',
                phone: '123', // demasiado corto
              },
            }),
          (error: unknown) => error instanceof ContractValidationError
        )
      },
    },
    {
      name: 'appointments contract rejects future date of birth',
      run: () => {
        const nextYear = new Date().getFullYear() + 1
        assert.throws(
          () =>
            parsePublicAppointmentPayload({
              firstName: 'Paciente',
              lastNamePaternal: 'Prueba',
              dateOfBirth: `${nextYear}-01-01`,
              phone: '6141234567',
              email: '',
              appointmentType: 'EXTENDED',
              startTime: '2026-05-01T10:00:00.000-07:00',
              doctorId: validDoctorId,
              privacyConsentAccepted: true,
            }),
          (error: unknown) =>
            error instanceof ContractValidationError &&
            error.message.includes('fecha de nacimiento no puede ser futura')
        )
      },
    },
  ])
}
