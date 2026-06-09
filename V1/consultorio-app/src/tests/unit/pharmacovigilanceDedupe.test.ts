import assert from 'node:assert/strict'
import {
  buildMedicationDedupKey,
  dedupeAlerts,
  deterministicPrescriptionAlerts,
} from '../../lib/aiNoteService.ts'
import { runSuite } from '../testHarness.ts'

export async function runPharmacovigilanceDedupeUnitTests() {
  await runSuite('Unit: pharmacovigilance dedupe', [
    {
      name: 'buildMedicationDedupKey ignora dosis y forma farmacéutica',
      run: () => {
        const a = buildMedicationDedupKey('Ibuprofeno 400 mg tableta')
        const b = buildMedicationDedupKey('ibuprofeno 600mg cápsulas')
        assert.equal(a, b)
      },
    },
    {
      name: 'dedupeAlerts elimina alertas equivalentes por puntuación/espacios',
      run: () => {
        const deduped = dedupeAlerts([
          {
            severity: 'high',
            message: 'Combinación de anticoagulante con AINE detectada.',
            recommendation: 'Evalúa riesgo hemorrágico y considera alternativa.',
          },
          {
            severity: 'high',
            message: 'Combinación de anticoagulante con AINE detectada',
            recommendation: 'Evalúa   riesgo hemorrágico y considera alternativa',
          },
        ])
        assert.equal(deduped.length, 1)
      },
    },
    {
      name: 'deterministicPrescriptionAlerts detecta duplicidad con dosis distintas',
      run: () => {
        const alerts = deterministicPrescriptionAlerts({
          prescriptions: [
            {
              medication: 'Paracetamol 500 mg tabletas',
              dosage: '',
              frequency: '',
              duration: '',
              instructions: '',
            },
            {
              medication: 'paracetamol 1g',
              dosage: '',
              frequency: '',
              duration: '',
              instructions: '',
            },
          ],
          medicalRecord: {},
          questionnaire: {},
        })
        assert.ok(alerts.some((a) => a.message.includes('potencialmente duplicado')))
      },
    },
    {
      name: 'deterministicPrescriptionAlerts detecta triple combinación de riesgo renal',
      run: () => {
        const alerts = deterministicPrescriptionAlerts({
          prescriptions: [
            { medication: 'Losartán 50 mg', dosage: '', frequency: '', duration: '', instructions: '' },
            { medication: 'Furosemida 40 mg', dosage: '', frequency: '', duration: '', instructions: '' },
            { medication: 'Ibuprofeno 600 mg', dosage: '', frequency: '', duration: '', instructions: '' },
          ],
          medicalRecord: { chronicConditions: ['ERC'] },
          questionnaire: {},
        })
        assert.ok(alerts.some((a) => a.message.includes('triple combinación de riesgo renal')))
      },
    },
    {
      name: 'deterministicPrescriptionAlerts detecta riesgo serotoninérgico tramadol + ISRS/SNRI',
      run: () => {
        const alerts = deterministicPrescriptionAlerts({
          prescriptions: [
            { medication: 'Tramadol 50 mg', dosage: '', frequency: '', duration: '', instructions: '' },
            { medication: 'Sertralina 50 mg', dosage: '', frequency: '', duration: '', instructions: '' },
          ],
          medicalRecord: {},
          questionnaire: {},
        })
        assert.ok(alerts.some((a) => a.message.includes('riesgo serotoninérgico')))
      },
    },
  ])
}
