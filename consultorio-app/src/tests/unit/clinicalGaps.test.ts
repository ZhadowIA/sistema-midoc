import assert from 'node:assert/strict'
import {
  deterministicGapAnalysis,
  dedupeGaps,
  type ClinicalGap,
} from '../../lib/clinicalGapsService.ts'
import { runSuite } from '../testHarness.ts'

function makeFullClinicalHistory() {
  return {
    identification: { sex: 'M', bloodType: 'O+' },
    familyHistory: { diabetes: 'madre' },
    nonPathologicalHistory: { smoking: 'no' },
    pathologicalHistory: { hypertension: 'diagnosticada 2020' },
    currentMedications: [{ name: 'Metformina', dose: '850mg' }],
    allergies: [{ substance: 'Penicilina', reaction: 'Urticaria' }],
    alerts: [],
    completionPct: 80,
    status: 'FINAL' as const,
  }
}

function makeFullEncounter() {
  return {
    chiefComplaint: 'Dolor de cabeza',
    presentIllness: { onset: '2 días', duration: 'intermitente' },
    pertinentNegatives: ['sin fiebre'],
    reviewOfSystems: { general: 'normal' },
    vitals: { pa: '120/80', fc: '72', temp: '36.5' },
    physicalExam: { general: 'paciente alerta' },
    assessment: [{ diagnosis: 'Cefalea tensional' }],
    diagnosticPlan: { labs: 'no requeridos' },
    treatmentPlan: { rx: 'Paracetamol 500mg' },
    followUp: { nextVisit: '2 semanas' },
    completionPct: 90,
    status: 'FINAL' as const,
  }
}

export async function runClinicalGapsUnitTests() {
  await runSuite('Unit: deterministicGapAnalysis', [
    {
      name: 'detecta alergias vacías como severidad medium',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: {
            ...makeFullClinicalHistory(),
            allergies: [],
          },
          medicalRecord: { bloodType: 'A+' },
          encounterPayload: makeFullEncounter(),
        })
        const allergyGap = gaps.find((g) => g.message.includes('Alergias'))
        assert.ok(allergyGap, 'Debe detectar alergias vacías')
        assert.equal(allergyGap.severity, 'medium')
        assert.equal(allergyGap.category, 'missing-data')
      },
    },
    {
      name: 'detecta tipo de sangre ausente como severidad low',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: makeFullClinicalHistory(),
          medicalRecord: { bloodType: null },
          encounterPayload: makeFullEncounter(),
        })
        const btGap = gaps.find((g) => g.message.includes('sangre'))
        assert.ok(btGap, 'Debe detectar tipo de sangre ausente')
        assert.equal(btGap.severity, 'low')
      },
    },
    {
      name: 'detecta antecedentes patológicos vacíos como medium',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: {
            ...makeFullClinicalHistory(),
            pathologicalHistory: {},
          },
          medicalRecord: { bloodType: 'B+' },
          encounterPayload: makeFullEncounter(),
        })
        const pathGap = gaps.find((g) => g.message.includes('patológicos'))
        assert.ok(pathGap)
        assert.equal(pathGap.severity, 'medium')
      },
    },
    {
      name: 'detecta medicamentos actuales vacíos como medium',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: {
            ...makeFullClinicalHistory(),
            currentMedications: [],
          },
          medicalRecord: { bloodType: 'O-' },
          encounterPayload: makeFullEncounter(),
        })
        const medGap = gaps.find((g) => g.message.includes('Medicamentos'))
        assert.ok(medGap)
        assert.equal(medGap.severity, 'medium')
      },
    },
    {
      name: 'detecta signos vitales faltantes como medium',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: makeFullClinicalHistory(),
          medicalRecord: { bloodType: 'AB+' },
          encounterPayload: {
            ...makeFullEncounter(),
            vitals: {},
          },
        })
        const vitalGap = gaps.find((g) => g.message.includes('vitales'))
        assert.ok(vitalGap)
        assert.equal(vitalGap.severity, 'medium')
      },
    },
    {
      name: 'detecta antecedentes familiares vacíos como low',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: {
            ...makeFullClinicalHistory(),
            familyHistory: {},
          },
          medicalRecord: { bloodType: 'A-' },
          encounterPayload: makeFullEncounter(),
        })
        const famGap = gaps.find((g) => g.message.includes('familiares'))
        assert.ok(famGap)
        assert.equal(famGap.severity, 'low')
      },
    },
    {
      name: 'detecta exploración física vacía como low',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: makeFullClinicalHistory(),
          medicalRecord: { bloodType: 'O+' },
          encounterPayload: {
            ...makeFullEncounter(),
            physicalExam: {},
          },
        })
        const examGap = gaps.find((g) => g.message.includes('física'))
        assert.ok(examGap)
        assert.equal(examGap.severity, 'low')
      },
    },
    {
      name: 'no genera gaps cuando todos los datos están completos',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: makeFullClinicalHistory(),
          medicalRecord: { bloodType: 'O+' },
          encounterPayload: makeFullEncounter(),
        })
        assert.equal(gaps.length, 0, `Se esperaban 0 gaps, recibidos: ${gaps.map((g) => g.message).join(', ')}`)
      },
    },
    {
      name: 'maneja null en todos los inputs sin error',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: null,
          medicalRecord: null,
          encounterPayload: null,
        })
        // Only medicalRecord.bloodType gap should be present (since clinicalHistory is null, no CH rules fire)
        assert.ok(gaps.length >= 1)
        assert.ok(gaps.some((g) => g.message.includes('sangre')))
      },
    },
    {
      name: 'detecta múltiples gaps simultáneamente',
      run: () => {
        const gaps = deterministicGapAnalysis({
          clinicalHistory: {
            ...makeFullClinicalHistory(),
            allergies: [],
            currentMedications: [],
            pathologicalHistory: {},
          },
          medicalRecord: { bloodType: null },
          encounterPayload: {
            ...makeFullEncounter(),
            vitals: {},
          },
        })
        assert.ok(gaps.length >= 4, `Se esperaban al menos 4 gaps, recibidos: ${gaps.length}`)
      },
    },
  ])

  await runSuite('Unit: dedupeGaps', [
    {
      name: 'elimina gaps duplicados por mensaje normalizado',
      run: () => {
        const gaps: ClinicalGap[] = [
          { severity: 'medium', category: 'missing-data', message: 'Alergias no registradas.' },
          { severity: 'medium', category: 'missing-data', message: 'Alergias no registradas' },
        ]
        const result = dedupeGaps(gaps)
        assert.equal(result.length, 1)
      },
    },
    {
      name: 'ordena por severidad: high → medium → low',
      run: () => {
        const gaps: ClinicalGap[] = [
          { severity: 'low', category: 'missing-data', message: 'Gap bajo' },
          { severity: 'high', category: 'contradiction', message: 'Gap alto' },
          { severity: 'medium', category: 'missing-data', message: 'Gap medio' },
        ]
        const result = dedupeGaps(gaps)
        assert.equal(result[0].severity, 'high')
        assert.equal(result[1].severity, 'medium')
        assert.equal(result[2].severity, 'low')
      },
    },
    {
      name: 'limita a máximo 10 gaps',
      run: () => {
        const gaps: ClinicalGap[] = Array.from({ length: 15 }, (_, i) => ({
          severity: 'low' as const,
          category: 'missing-data' as const,
          message: `Gap ${i}`,
        }))
        const result = dedupeGaps(gaps)
        assert.ok(result.length <= 10)
      },
    },
    {
      name: 'mantiene gaps con categorías diferentes aunque mismo mensaje',
      run: () => {
        const gaps: ClinicalGap[] = [
          { severity: 'medium', category: 'missing-data', message: 'Problema X' },
          { severity: 'high', category: 'contradiction', message: 'Problema X' },
        ]
        const result = dedupeGaps(gaps)
        assert.equal(result.length, 2, 'Debe mantener ambos porque tienen categorías distintas')
      },
    },
  ])
}
