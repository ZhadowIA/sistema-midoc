import assert from 'node:assert/strict'
import { runSuite } from '../testHarness.ts'
import {
  TEST_DB_ENABLED,
  initTestDb,
  truncateAll,
  seedDoctorAndPatient,
  seedAppointment,
} from './setupTestDb.ts'

export async function runClinicalDbIntegrationTests() {
  if (!TEST_DB_ENABLED) {
    console.log(
      '\nIntegration: DB flows — SKIPPED (TEST_DATABASE_URL no configurado)',
    )
    return
  }

  const prisma = await initTestDb()
  await truncateAll(prisma)

  // Carga perezosa tras setear DATABASE_URL (los servicios usan la singleton
  // de src/lib/prisma, que tomará la variable TEST_DATABASE_URL ya aplicada).
  const { ClinicalHistoryService } = await import(
    '../../services/ClinicalHistoryService.ts'
  )
  const { EncounterHistoryService } = await import(
    '../../services/EncounterHistoryService.ts'
  )
  const { QuestionnaireService } = await import(
    '../../services/QuestionnaireService.ts'
  )
  const { buildEmptyClinicalHistory, buildEmptyEncounterHistory, hasMinimumForSignoff } =
    await import('../../lib/clinicalFormat.ts')
  const { hashSnapshot } = await import('../../lib/clinicalSignature.ts')

  await runSuite('Integration: clinical DB flows', [
    {
      name: 'upsert ClinicalHistory crea versión (ClinicalHistoryVersion)',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const payload = buildEmptyClinicalHistory()
        payload.identification.bloodType = 'O+'
        payload.allergies = [{ description: 'Penicilina' }]
        await ClinicalHistoryService.upsertByPatientId(patient.id, doctor.id, payload, {
          actorUserId: doctor.id,
        })
        const v1 = await prisma.clinicalHistoryVersion.count({
          where: { patientId: patient.id },
        })
        assert.equal(v1, 1, 'debe registrar una versión tras el primer upsert')

        payload.identification.bloodType = 'A+'
        await ClinicalHistoryService.upsertByPatientId(patient.id, doctor.id, payload, {
          actorUserId: doctor.id,
        })
        const v2 = await prisma.clinicalHistoryVersion.count({
          where: { patientId: patient.id },
        })
        assert.equal(v2, 2, 'segundo upsert crea nueva versión')
      },
    },
    {
      name: 'upsert EncounterHistory crea versión (EncounterHistoryVersion)',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appointment = await seedAppointment(prisma, doctor.id, patient.id)
        const payload = buildEmptyEncounterHistory()
        payload.chiefComplaint = 'Cefalea'
        await EncounterHistoryService.upsertByAppointmentId(
          appointment.id,
          patient.id,
          doctor.id,
          payload,
          { actorUserId: doctor.id },
        )
        const v1 = await prisma.encounterHistoryVersion.count({
          where: { appointmentId: appointment.id },
        })
        assert.equal(v1, 1)

        payload.chiefComplaint = 'Cefalea persistente'
        await EncounterHistoryService.upsertByAppointmentId(
          appointment.id,
          patient.id,
          doctor.id,
          payload,
          { actorUserId: doctor.id },
        )
        const v2 = await prisma.encounterHistoryVersion.count({
          where: { appointmentId: appointment.id },
        })
        assert.equal(v2, 2)
      },
    },
    {
      name: 'firma de SOAP con mínimos faltantes es rechazada (equivalente a 422)',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appointment = await seedAppointment(prisma, doctor.id, patient.id)
        const empty = buildEmptyEncounterHistory()
        await EncounterHistoryService.upsertByAppointmentId(
          appointment.id,
          patient.id,
          doctor.id,
          empty,
        )
        const check = hasMinimumForSignoff(empty)
        assert.equal(check.ok, false, 'debe reportar faltantes')
        assert.ok(check.missing.includes('motivo de consulta'))
        assert.ok(check.missing.includes('impresión diagnóstica'))

        // No se debe haber firmado ninguna nota
        const notes = await prisma.clinicalNote.findMany({
          where: { appointmentId: appointment.id, signatureHash: { not: null } },
        })
        assert.equal(notes.length, 0)

        // Sanidad: hash determinístico del snapshot
        const h1 = hashSnapshot({ a: 1, b: [2, 3] })
        const h2 = hashSnapshot({ b: [2, 3], a: 1 })
        assert.equal(h1, h2, 'canonicalize debe producir hashes estables')
      },
    },
    {
      name: 'prefill desde cuestionario mapea chiefComplaint/presentIllness/ros',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appointment = await seedAppointment(prisma, doctor.id, patient.id)
        await prisma.questionnaire.create({
          data: {
            appointmentId: appointment.id,
            primarySymptom: 'Dolor abdominal',
            responses: {
              chiefComplaint: 'Dolor abdominal intenso',
              presentIllness: { onset: 'hace 3 días', intensity: '7/10' },
              pertinentNegatives: ['sin fiebre', 'sin vómito'],
              ros: { gastrointestinal: 'náusea leve' },
            },
          },
        })
        const prefill = await QuestionnaireService.buildEncounterPrefill(appointment.id)
        assert.equal(prefill.source, 'questionnaire')
        assert.equal(prefill.payload.chiefComplaint, 'Dolor abdominal intenso')
        assert.equal(prefill.payload.presentIllness.onset, 'hace 3 días')
        assert.equal(prefill.payload.presentIllness.intensity, '7/10')
        assert.deepEqual(prefill.payload.pertinentNegatives, ['sin fiebre', 'sin vómito'])
        assert.deepEqual(prefill.payload.reviewOfSystems, {
          gastrointestinal: 'náusea leve',
        })
      },
    },
  ])

  await prisma.$disconnect()
}
