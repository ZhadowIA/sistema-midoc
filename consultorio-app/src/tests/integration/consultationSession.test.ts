import assert from 'node:assert/strict'
import { runSuite } from '../testHarness.ts'
import {
  TEST_DB_ENABLED,
  initTestDb,
  truncateAll,
  seedDoctorAndPatient,
  seedAppointment,
} from './setupTestDb.ts'

export async function runConsultationSessionIntegrationTests() {
  if (!TEST_DB_ENABLED) {
    console.log(
      '\nIntegration: consultation session — SKIPPED (TEST_DATABASE_URL no configurado)',
    )
    return
  }

  const prisma = await initTestDb()
  await truncateAll(prisma)

  const { EncounterHistoryService } = await import(
    '../../services/EncounterHistoryService.ts'
  )
  const { resolveConsultationSession, shouldSkipSessionQueries } = await import(
    '../../lib/consultationWorkspace.ts'
  )

  await runSuite('Integration: consultation session', [
    {
      name: 'setConsultationMode crea EncounterHistory con modo elegido',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)
        await EncounterHistoryService.setConsultationMode(
          appt.id,
          patient.id,
          doctor.id,
          'HYBRID',
        )
        const row = await prisma.encounterHistory.findUnique({
          where: { appointmentId: appt.id },
        })
        assert.ok(row, 'debe crear registro')
        assert.equal(row?.consultationMode, 'HYBRID')
        assert.equal(row?.aiConsent, 'PENDING')
      },
    },
    {
      name: 'setConsultationMode sobre registro existente solo actualiza el modo',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)
        await EncounterHistoryService.setConsultationMode(
          appt.id,
          patient.id,
          doctor.id,
          'AI_DICTATION',
        )
        await EncounterHistoryService.setConsultationMode(
          appt.id,
          patient.id,
          doctor.id,
          'MANUAL',
        )
        const row = await prisma.encounterHistory.findUnique({
          where: { appointmentId: appt.id },
        })
        assert.equal(row?.consultationMode, 'MANUAL')
      },
    },
    {
      name: 'context fallback usa preferredConsultationMode cuando no hay EncounterHistory',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)
        await prisma.doctorConfig.create({
          data: {
            doctorId: doctor.id,
            consultationDurationMin: 30,
            preferredConsultationMode: 'HYBRID',
          },
        })
        const existing = await prisma.encounterHistory.findUnique({
          where: { appointmentId: appt.id },
          select: { consultationMode: true, aiConsent: true, aiConsentDecidedAt: true },
        })
        assert.equal(existing, null, 'no debe existir encounter aún')
        const preferred = await prisma.doctorConfig.findUnique({
          where: { doctorId: doctor.id },
          select: { preferredConsultationMode: true },
        })
        const session = resolveConsultationSession({
          isReadOnly: false,
          existing,
          preferredConsultationMode: preferred?.preferredConsultationMode ?? null,
        })
        assert.equal(session.consultationMode, 'HYBRID')
        assert.equal(session.aiConsent, 'PENDING')
      },
    },
    {
      name: 'setAiConsent GRANTED guarda timestamp y actor',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)
        await EncounterHistoryService.setAiConsent(
          appt.id,
          patient.id,
          doctor.id,
          'GRANTED',
          doctor.id,
        )
        const row = await prisma.encounterHistory.findUnique({
          where: { appointmentId: appt.id },
        })
        assert.equal(row?.aiConsent, 'GRANTED')
        assert.ok(row?.aiConsentDecidedAt, 'debe fijar decidedAt')
        assert.equal(row?.aiConsentActorUserId, doctor.id)
      },
    },
    {
      name: 'setAiConsent DENIED no borra el modo preseleccionado',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)
        await EncounterHistoryService.setConsultationMode(
          appt.id,
          patient.id,
          doctor.id,
          'HYBRID',
        )
        await EncounterHistoryService.setAiConsent(
          appt.id,
          patient.id,
          doctor.id,
          'DENIED',
          doctor.id,
        )
        const row = await prisma.encounterHistory.findUnique({
          where: { appointmentId: appt.id },
        })
        assert.equal(row?.aiConsent, 'DENIED')
        assert.equal(
          row?.consultationMode,
          'HYBRID',
          'la capa API es la responsable de forzar MANUAL ante DENIED',
        )
      },
    },
    {
      name: 'setAiConsent PENDING limpia decidedAt',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await seedAppointment(prisma, doctor.id, patient.id)
        await EncounterHistoryService.setAiConsent(
          appt.id,
          patient.id,
          doctor.id,
          'GRANTED',
          doctor.id,
        )
        await EncounterHistoryService.setAiConsent(
          appt.id,
          patient.id,
          doctor.id,
          'PENDING',
          doctor.id,
        )
        const row = await prisma.encounterHistory.findUnique({
          where: { appointmentId: appt.id },
        })
        assert.equal(row?.aiConsent, 'PENDING')
        assert.equal(row?.aiConsentDecidedAt, null)
      },
    },
    {
      name: 'readonly COMPLETED evita cargar modo/consent dinámicos',
      run: async () => {
        await truncateAll(prisma)
        const { doctor, patient } = await seedDoctorAndPatient(prisma)
        const appt = await prisma.appointment.create({
          data: {
            doctorId: doctor.id,
            patientId: patient.id,
            date: new Date(Date.now() + 3600_000),
            startTime: new Date(Date.now() + 3600_000),
            endTime: new Date(Date.now() + 5400_000),
            durationMin: 30,
            appointmentType: 'NORMAL',
            status: 'COMPLETED',
            source: 'DOCTOR',
          },
        })
        assert.equal(
          shouldSkipSessionQueries({
            appointmentStatus: appt.status,
            noteSignedAt: null,
          }),
          true,
        )
      },
    },
  ])
}
