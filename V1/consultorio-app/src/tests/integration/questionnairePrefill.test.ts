import assert from 'node:assert/strict'
import { runSuite } from '../testHarness.ts'
import {
  TEST_DB_ENABLED,
  initTestDb,
  truncateAll,
  seedDoctorAndPatient,
  seedAppointment,
} from './setupTestDb.ts'

export async function runQuestionnairePrefillIntegrationTests() {
  if (!TEST_DB_ENABLED) {
    console.log(
      '\nIntegration: questionnaire prefill — SKIPPED (TEST_DATABASE_URL no configurado)',
    )
    return
  }

  const prisma = await initTestDb()
  await truncateAll(prisma)

  const { QuestionnaireService } = await import(
    '../../services/QuestionnaireService.ts'
  )

  await runSuite('Integration: questionnaire v2 prefill', [
    {
      name: 'sin cuestionario devuelve payload vacío (source=empty)',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)
        const { payload, source } = await QuestionnaireService.buildEncounterPrefill(appt.id)
        assert.equal(source, 'empty')
        assert.equal(payload.chiefComplaint, '')
        assert.equal(payload.completionPct, 0)
      },
    },
    {
      name: 'prefill v2: mapea chiefComplaint, presentIllness, pertinentNegatives y ros',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)

        await prisma.questionnaire.create({
          data: {
            appointmentId: appt.id,
            primarySymptom: 'cefalea',
            responses: {
              chiefComplaint: 'Cefalea intensa de 3 días',
              presentIllness: {
                onset: 'hace 3 días',
                duration: '3 días',
                intensity: '8/10',
                associatedSymptoms: ['náusea', 'fotofobia'],
              },
              pertinentNegatives: ['sin fiebre', 'sin trauma'],
              ros: { neurological: 'cefalea', gastrointestinal: 'náusea' },
            },
          },
        })

        const { payload, source } = await QuestionnaireService.buildEncounterPrefill(appt.id)
        assert.equal(source, 'questionnaire')
        assert.equal(payload.chiefComplaint, 'Cefalea intensa de 3 días')
        assert.equal(payload.presentIllness.onset, 'hace 3 días')
        assert.equal(payload.presentIllness.intensity, '8/10')
        assert.deepEqual(payload.presentIllness.associatedSymptoms, ['náusea', 'fotofobia'])
        assert.deepEqual(payload.pertinentNegatives, ['sin fiebre', 'sin trauma'])
        assert.deepEqual(payload.reviewOfSystems, {
          neurological: 'cefalea',
          gastrointestinal: 'náusea',
        })
        assert.ok(payload.completionPct > 0, 'completionPct debe ser > 0 con datos v2')
      },
    },
    {
      name: 'fallback: si no hay chiefComplaint usa primarySymptom legacy',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)

        await prisma.questionnaire.create({
          data: {
            appointmentId: appt.id,
            primarySymptom: 'dolor lumbar',
            responses: {
              respuesta_libre_1: 'algo viejo estilo flat',
            },
          },
        })

        const { payload, source } = await QuestionnaireService.buildEncounterPrefill(appt.id)
        assert.equal(source, 'questionnaire')
        assert.equal(payload.chiefComplaint, 'dolor lumbar')
      },
    },
    {
      name: 'ignora claves v2 con tipos inválidos sin romper',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)

        await prisma.questionnaire.create({
          data: {
            appointmentId: appt.id,
            primarySymptom: 'tos',
            responses: {
              chiefComplaint: 'Tos seca',
              presentIllness: 'no-es-objeto',
              pertinentNegatives: 'no-es-array',
              ros: ['no', 'es', 'objeto'],
            },
          },
        })

        const { payload } = await QuestionnaireService.buildEncounterPrefill(appt.id)
        assert.equal(payload.chiefComplaint, 'Tos seca')
        assert.deepEqual(payload.pertinentNegatives, [])
        assert.deepEqual(payload.reviewOfSystems, {})
      },
    },
  ])
}
