import assert from 'node:assert/strict'
import {
  ContractValidationError,
  parseAvailabilityDayQuery,
  parseAvailabilityMonthQuery,
  parsePublicAppointmentPayload,
} from '../../lib/publicApiContracts.ts'
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
      name: 'appointments contract normalizes name and phone',
      run: () => {
        const payload = parsePublicAppointmentPayload({
          fullName: '  Ana   López   ',
          dateOfBirth: '1995-07-10',
          phone: '(614) 123-45-67',
          email: 'ana@example.com',
          appointmentType: 'NORMAL',
          startTime: '2026-05-01T10:00:00.000-07:00',
          doctorId: validDoctorId,
        })

        assert.equal(payload.fullName, 'Ana López')
        assert.equal(payload.phone, '6141234567')
      },
    },
    {
      name: 'appointments contract rejects future date of birth',
      run: () => {
        const nextYear = new Date().getFullYear() + 1
        assert.throws(
          () =>
            parsePublicAppointmentPayload({
              fullName: 'Paciente Prueba',
              dateOfBirth: `${nextYear}-01-01`,
              phone: '6141234567',
              email: '',
              appointmentType: 'EXTENDED',
              startTime: '2026-05-01T10:00:00.000-07:00',
              doctorId: validDoctorId,
            }),
          (error: unknown) =>
            error instanceof ContractValidationError &&
            error.message.includes('fecha de nacimiento no puede ser futura')
        )
      },
    },
  ])
}
