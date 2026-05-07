import assert from 'node:assert/strict'
import { runSuite } from '../testHarness.ts'
import {
  appendMouthCondition,
  removeMouthCondition,
  resolveToothStatusFromFinding,
} from '../../lib/dentalPayload.ts'
import type { DentalSpecialtyPayload } from '../../lib/specialtyPayloadSchemas.ts'

const basePayload: DentalSpecialtyPayload = {
  odontogram: {},
  periodontogram: {},
  mouthConditions: [],
  treatmentPlan: [],
  hygienePlan: undefined,
  nextRevision: undefined,
}

export async function runDentalPayloadUnitTests() {
  await runSuite('Unit: dentalPayload', [
    {
      name: 'adds mouth-wide conditions with date and unresolved state',
      run: async () => {
        const updated = appendMouthCondition(basePayload, {
          condition: 'PERIODONTAL_DISEASE',
          severity: 'MODERATE',
          notes: 'Sangrado generalizado',
          today: '2026-04-28',
          idFactory: () => 'condition-1',
        })

        assert.deepEqual(updated.mouthConditions, [
          {
            id: 'condition-1',
            date: '2026-04-28',
            condition: 'PERIODONTAL_DISEASE',
            severity: 'MODERATE',
            notes: 'Sangrado generalizado',
            resolved: false,
          },
        ])
        assert.notEqual(updated, basePayload)
      },
    },
    {
      name: 'removes mouth-wide conditions without mutating the original payload',
      run: async () => {
        const payload: DentalSpecialtyPayload = {
          ...basePayload,
          mouthConditions: [
            {
              id: 'keep',
              date: '2026-04-27',
              condition: 'MALOCCLUSION',
              resolved: false,
            },
            {
              id: 'delete',
              date: '2026-04-28',
              condition: 'PERIODONTAL_DISEASE',
              resolved: false,
            },
          ],
        }

        const updated = removeMouthCondition(payload, 'delete')

        assert.equal(updated.mouthConditions.length, 1)
        assert.equal(updated.mouthConditions[0]?.id, 'keep')
        assert.equal(payload.mouthConditions.length, 2)
      },
    },
    {
      name: 'maps common findings to clinical tooth status',
      run: async () => {
        assert.equal(resolveToothStatusFromFinding({ level: 'PIECE', finding: 'ABSENCE' }), 'MISSING')
        assert.equal(resolveToothStatusFromFinding({ level: 'PIECE', finding: 'RETAINED' }), 'IMPACTED')
        assert.equal(resolveToothStatusFromFinding({ level: 'FACE', finding: 'CARIES' }), 'CARIES')
        assert.equal(resolveToothStatusFromFinding({ level: 'FACE', finding: 'RESIN' }), 'RESTORED')
      },
    },
  ])
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runDentalPayloadUnitTests().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
