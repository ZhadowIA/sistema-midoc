import assert from 'node:assert/strict'
import { createClinicalEncounterSchema } from '../../lib/clinicalEncounterContracts.ts'
import { runSuite } from '../testHarness.ts'

export async function runClinicalEncounterContractsUnitTests() {
  await runSuite('Unit: clinicalEncounterContracts', [
    {
      name: 'defaults source to STANDALONE when appointmentId is missing',
      run: () => {
        const parsed = createClinicalEncounterSchema.parse({
          patientId: ' patient-1 ',
        })
        assert.equal(parsed.patientId, 'patient-1')
        assert.equal(parsed.appointmentId, undefined)
        assert.equal(parsed.source, 'STANDALONE')
      },
    },
    {
      name: 'defaults source to APPOINTMENT when appointmentId exists',
      run: () => {
        const parsed = createClinicalEncounterSchema.parse({
          patientId: 'patient-2',
          appointmentId: ' apt-1 ',
        })
        assert.equal(parsed.appointmentId, 'apt-1')
        assert.equal(parsed.source, 'APPOINTMENT')
      },
    },
    {
      name: 'accepts explicit source override',
      run: () => {
        const parsed = createClinicalEncounterSchema.parse({
          patientId: 'patient-3',
          source: 'MIGRATION',
        })
        assert.equal(parsed.source, 'MIGRATION')
      },
    },
  ])
}
