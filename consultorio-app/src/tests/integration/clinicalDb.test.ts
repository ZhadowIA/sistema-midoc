import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
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

        const versions = await ClinicalHistoryService.listVersionsByPatientId(patient.id, 10)
        assert.equal(versions.length, 2, 'debe listar versiones creadas')
        assert.ok(
          versions[0].createdAt.getTime() >= versions[1].createdAt.getTime(),
          'debe regresar ordenado desc por createdAt',
        )
        assert.equal(versions[0].status, payload.status)
        assert.equal(
          (versions[0].payload as { identification?: { bloodType?: string } }).identification
            ?.bloodType,
          'A+',
        )
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
      name: 'firma de SOAP con mínimos completos produce signatureHash válido (equivalente a POST /note sign:true)',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appointment = await seedAppointment(prisma, doctor.id, patient.id)
        const payload = buildEmptyEncounterHistory()
        payload.chiefComplaint = 'cefalea'
        payload.presentIllness = { summary: 'dolor de 2 días' }
        payload.vitals = { ta: '120/80', fc: '72' }
        payload.physicalExam = { neurologico: 'sin focalización' }
        payload.assessment = [{ diagnosis: 'cefalea tensional' }]
        payload.treatmentPlan = { farmacologico: 'paracetamol' }
        const encounter = await EncounterHistoryService.upsertByAppointmentId(
          appointment.id,
          patient.id,
          doctor.id,
          payload,
          { actorUserId: doctor.id },
        )
        const check = hasMinimumForSignoff(payload)
        assert.equal(check.ok, true, 'debe permitir firmar con mínimos completos')

        const snapshot = {
          encounterHistoryId: encounter.id,
          appointmentId: appointment.id,
          patientId: patient.id,
          completionPct: encounter.completionPct,
          status: encounter.status,
          payload,
          soap: {
            subjective: 'Refiere dolor opresivo frontal',
            objective: 'Signos vitales estables',
            assessment: 'Cefalea tensional',
            plan: 'Paracetamol y medidas generales',
          },
        }
        const signatureHash = hashSnapshot(snapshot)
        const signed = await prisma.clinicalNote.create({
          data: {
            appointmentId: appointment.id,
            doctorId: doctor.id,
            patientId: patient.id,
            subjective: snapshot.soap.subjective,
            objective: snapshot.soap.objective,
            assessment: snapshot.soap.assessment,
            plan: snapshot.soap.plan,
            signatureHash,
            signedAt: new Date(),
            signedByUserId: doctor.id,
            signedSnapshot: snapshot as Prisma.InputJsonValue,
          },
        })
        assert.match(
          signed.signatureHash ?? '',
          /^[a-f0-9]{64}$/,
          'signatureHash debe ser SHA-256 hex',
        )
        const recomputed = hashSnapshot(snapshot)
        assert.equal(signed.signatureHash, recomputed)
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
