import assert from 'node:assert/strict'
import {
  buildEmptyClinicalHistory,
  buildEmptyEncounterHistory,
  calculateClinicalCompletionPct,
  calculateEncounterCompletionPct,
  hasMinimumForSignoff,
  migrateFromMedicalRecord,
} from '../../lib/clinicalFormat.ts'
import { runSuite } from '../testHarness.ts'

export async function runClinicalFormatUnitTests() {
  await runSuite('Unit: clinicalFormat', [
    {
      name: 'buildEmptyClinicalHistory returns a DRAFT with 0% completion',
      run: () => {
        const p = buildEmptyClinicalHistory()
        assert.equal(p.status, 'DRAFT')
        assert.equal(p.completionPct, 0)
        assert.deepEqual(p.allergies, [])
        assert.deepEqual(p.currentMedications, [])
        assert.deepEqual(p.identification, {})
      },
    },
    {
      name: 'buildEmptyEncounterHistory returns empty DRAFT',
      run: () => {
        const p = buildEmptyEncounterHistory()
        assert.equal(p.status, 'DRAFT')
        assert.equal(p.completionPct, 0)
        assert.equal(p.chiefComplaint, '')
        assert.deepEqual(p.assessment, [])
      },
    },
    {
      name: 'calculateClinicalCompletionPct counts non-empty sections',
      run: () => {
        const p = buildEmptyClinicalHistory()
        assert.equal(calculateClinicalCompletionPct(p), 0)
        p.identification.sex = 'F'
        p.allergies = [{ description: 'penicilina' }]
        assert.equal(calculateClinicalCompletionPct(p), Math.round((2 / 6) * 100))
      },
    },
    {
      name: 'calculateEncounterCompletionPct requires meaningful content',
      run: () => {
        const p = buildEmptyEncounterHistory()
        assert.equal(calculateEncounterCompletionPct(p), 0)
        p.chiefComplaint = 'dolor abdominal'
        p.vitals = { ta: '120/80' }
        p.assessment = [{ diagnosis: 'gastritis' }]
        const pct = calculateEncounterCompletionPct(p)
        assert.equal(pct, Math.round((3 / 6) * 100))
      },
    },
    {
      name: 'hasMinimumForSignoff flags all required sections when empty',
      run: () => {
        const p = buildEmptyEncounterHistory()
        const r = hasMinimumForSignoff(p)
        assert.equal(r.ok, false)
        assert.ok(r.missing.includes('motivo de consulta'))
        assert.ok(r.missing.includes('signos vitales'))
        assert.ok(r.missing.includes('impresión diagnóstica'))
        assert.ok(r.missing.includes('plan'))
      },
    },
    {
      name: 'hasMinimumForSignoff passes when all minimums present',
      run: () => {
        const p = buildEmptyEncounterHistory()
        p.chiefComplaint = 'cefalea'
        p.presentIllness = { summary: 'inicia hace 3 días' }
        p.vitals = { ta: '120/80', fc: '72' }
        p.physicalExam = { general: 'buen estado' }
        p.assessment = [{ diagnosis: 'cefalea tensional' }]
        p.treatmentPlan = { farmacologico: 'paracetamol' }
        const r = hasMinimumForSignoff(p)
        assert.equal(r.ok, true)
        assert.deepEqual(r.missing, [])
      },
    },
    {
      name: 'migrateFromMedicalRecord maps legacy fields and recomputes completion',
      run: () => {
        const p = migrateFromMedicalRecord({
          bloodType: 'O+',
          allergies: 'penicilina',
          chronicConditions: 'DM2',
          familyHistory: 'HTA en madre',
        })
        assert.equal(p.identification.bloodType, 'O+')
        assert.equal(p.allergies.length, 1)
        assert.equal((p.allergies[0] as { description: string }).description, 'penicilina')
        assert.equal(p.pathologicalHistory.chronicConditions, 'DM2')
        assert.equal(p.familyHistory.summary, 'HTA en madre')
        assert.ok(p.completionPct > 0)
      },
    },
    {
      name: 'migrateFromMedicalRecord ignores null legacy fields',
      run: () => {
        const p = migrateFromMedicalRecord({
          bloodType: null,
          allergies: null,
          chronicConditions: null,
          familyHistory: null,
        })
        assert.equal(p.completionPct, 0)
        assert.deepEqual(p.allergies, [])
        assert.deepEqual(p.identification, {})
      },
    },
  ])
}
