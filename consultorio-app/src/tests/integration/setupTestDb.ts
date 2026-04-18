import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const testUrl = process.env.TEST_DATABASE_URL?.trim()

export const TEST_DB_ENABLED = Boolean(testUrl)

function assertTestDatabase(url: string) {
  // Extract last path segment (the db name, before any "?query")
  const match = url.match(/\/([^/?]+)(?:\?|$)/)
  const dbName = match?.[1] ?? ''
  if (!/test/i.test(dbName)) {
    throw new Error(
      `TEST_DATABASE_URL apunta a la base "${dbName}" que no contiene "test". Aborto por seguridad.`,
    )
  }
}

let prismaTest: PrismaClient | null = null
let migrated = false

export async function initTestDb(): Promise<PrismaClient> {
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL no configurado')
  }
  assertTestDatabase(testUrl)
  process.env.DATABASE_URL = testUrl

  if (!migrated) {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testUrl },
    })
    migrated = true
  }

  if (!prismaTest) {
    prismaTest = new PrismaClient({ datasources: { db: { url: testUrl } } })
  }
  return prismaTest
}

export async function truncateAll(prisma: PrismaClient) {
  // Orden respeta FKs: primero tablas hoja, luego raíces.
  await prisma.$transaction([
    prisma.encounterHistoryVersion.deleteMany(),
    prisma.clinicalHistoryVersion.deleteMany(),
    prisma.prescription.deleteMany(),
    prisma.clinicalNote.deleteMany(),
    prisma.encounterHistory.deleteMany(),
    prisma.clinicalHistory.deleteMany(),
    prisma.medicalRecord.deleteMany(),
    prisma.questionnaire.deleteMany(),
    prisma.appointmentAuditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.user.deleteMany(),
  ])
}

export async function seedDoctorAndPatient(prisma: PrismaClient) {
  const doctor = await prisma.user.create({
    data: {
      email: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      passwordHash: 'x',
      name: 'Doctor Test',
      role: 'DOCTOR',
    },
  })
  const patient = await prisma.patient.create({
    data: {
      fullName: 'Paciente Test',
      phone: `+52100000${Math.floor(Math.random() * 10000)}`,
      dateOfBirth: new Date('1990-01-01'),
      ownerDoctorId: doctor.id,
    },
  })
  return { doctor, patient }
}

export async function seedAppointment(
  prisma: PrismaClient,
  doctorId: string,
  patientId: string,
) {
  const start = new Date(Date.now() + 3600_000)
  const end = new Date(start.getTime() + 30 * 60_000)
  return prisma.appointment.create({
    data: {
      doctorId,
      patientId,
      date: start,
      startTime: start,
      endTime: end,
      durationMin: 30,
      appointmentType: 'NORMAL',
      status: 'CONFIRMED',
      source: 'DOCTOR',
    },
  })
}
