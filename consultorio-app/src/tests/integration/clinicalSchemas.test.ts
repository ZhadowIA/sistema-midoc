import assert from 'node:assert/strict'
import { ClinicalHistoryPayloadSchema } from '../../lib/clinicalHistorySchema.ts'
import { EncounterHistoryPayloadSchema } from '../../lib/encounterHistorySchema.ts'
import {
  buildEmptyClinicalHistory,
  buildEmptyEncounterHistory,
} from '../../lib/clinicalFormat.ts'
import { runSuite } from '../testHarness.ts'

export async function runClinicalSchemasIntegrationTests() {
  await runSuite('Integration: clinical payload schemas', [
    {
      name: 'ClinicalHistory schema accepts empty scaffold',
      run: () => {
        const parsed = ClinicalHistoryPayloadSchema.parse(buildEmptyClinicalHistory())
        assert.equal(parsed.status, 'DRAFT')
        assert.equal(parsed.completionPct, 0)
      },
    },
    {
      name: 'ClinicalHistory schema rejects invalid status',
      run: () => {
        const bad = { ...buildEmptyClinicalHistory(), status: 'FIRMADO' as unknown as 'FINAL' }
        const result = ClinicalHistoryPayloadSchema.safeParse(bad)
        assert.equal(result.success, false)
      },
    },
    {
      name: 'ClinicalHistory schema rejects completionPct out of range',
      run: () => {
        const bad = { ...buildEmptyClinicalHistory(), completionPct: 150 }
        const result = ClinicalHistoryPayloadSchema.safeParse(bad)
        assert.equal(result.success, false)
      },
    },
    {
      name: 'EncounterHistory schema accepts empty scaffold',
      run: () => {
        const parsed = EncounterHistoryPayloadSchema.parse(buildEmptyEncounterHistory())
        assert.deepEqual(parsed.assessment, [])
        assert.deepEqual(parsed.pertinentNegatives, [])
      },
    },
    {
      name: 'EncounterHistory schema requires diagnosis string on each assessment',
      run: () => {
        const base = buildEmptyEncounterHistory()
        const bad = {
          ...base,
          assessment: [{ probabilityPct: 80 }] as unknown as typeof base.assessment,
        }
        const result = EncounterHistoryPayloadSchema.safeParse(bad)
        assert.equal(result.success, false)
      },
    },
    {
      name: 'EncounterHistory schema rejects probabilityPct > 100',
      run: () => {
        const base = buildEmptyEncounterHistory()
        const bad = {
          ...base,
          assessment: [{ diagnosis: 'x', probabilityPct: 120 }],
        }
        const result = EncounterHistoryPayloadSchema.safeParse(bad)
        assert.equal(result.success, false)
      },
    },
    {
      name: 'EncounterHistory schema preserves extra keys in presentIllness',
      run: () => {
        const p = buildEmptyEncounterHistory()
        p.presentIllness = {
          ...p.presentIllness,
          summary: 'dolor de 3 días',
          // extra key allowed via passthrough
          customKey: 'valor extra',
        } as typeof p.presentIllness
        const parsed = EncounterHistoryPayloadSchema.parse(p)
        assert.equal(parsed.presentIllness.summary, 'dolor de 3 días')
      },
    },
  ])
}
