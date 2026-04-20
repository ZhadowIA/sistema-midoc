import prisma from '@/lib/prisma'
import { z } from 'zod'
import { parseDateOnlyLocal } from '@/lib/dateTime'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'

const createPatientSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastNamePaternal: z.string().trim().min(1).max(60),
    lastNameMaternal: z.string().trim().max(60).optional().nullable(),
    phone: z.string().min(7, 'Teléfono requerido'),
    email: z.string().email('Correo inválido').optional().or(z.literal('')),
    dateOfBirth: z.string().optional().or(z.literal('')),
  })
  

function resolveStructuredPatientName(input: z.infer<typeof createPatientSchema>) {
  const firstName = input.firstName.trim()
  const lastNamePaternal = input.lastNamePaternal.trim()
  const lastNameMaternal = input.lastNameMaternal?.trim() || null

  return { firstName, lastNamePaternal, lastNameMaternal }
}

export async function GET() {
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const patients = await prisma.patient.findMany({
      where: {
        ownerDoctorId: doctorId,
      },
      include: {
        appointments: {
          where: { doctorId },
          orderBy: { startTime: 'desc' },
          take: 1
        }
      },
      orderBy: [{ lastNamePaternal: 'asc' }, { firstName: 'asc' }]
    })

    const appointmentCounts = await prisma.appointment.groupBy({
      by: ['patientId'],
      where: { doctorId },
      _count: { _all: true },
    })

    const countByPatientId = new Map(
      appointmentCounts.map((row) => [row.patientId, row._count._all])
    )

    const payload = patients.map((patient) => ({
      ...patient,
      appointmentCount: countByPatientId.get(patient.id) ?? 0,
    }))

    return jsonNoStore(payload)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const parsed = createPatientSchema.safeParse(await request.json())
    if (!parsed.success) {
      return jsonNoStore({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
    }

    const structuredName = resolveStructuredPatientName(parsed.data)
    const firstName = structuredName.firstName
    const lastNamePaternal = structuredName.lastNamePaternal
    const lastNameMaternal = structuredName.lastNameMaternal

    if (!firstName || !lastNamePaternal) {
      return jsonNoStore({ error: 'Nombre y apellido paterno son requeridos' }, { status: 400 })
    }

    const phone = parsed.data.phone.trim()
    const email = parsed.data.email?.trim().toLowerCase() || null

    const duplicate = await prisma.patient.findFirst({
      where: {
        ownerDoctorId: doctorId,
        firstName,
        lastNamePaternal,
        phone,
      },
      select: { id: true },
    })

    if (duplicate) {
      return jsonNoStore(
        { error: 'Ya existe un paciente con ese nombre y teléfono en tu directorio.' },
        { status: 409 }
      )
    }

    let dateOfBirth = new Date()
    if (parsed.data.dateOfBirth) {
      try {
        dateOfBirth = parseDateOnlyLocal(parsed.data.dateOfBirth)
      } catch {
        return jsonNoStore({ error: 'Fecha de nacimiento inválida' }, { status: 400 })
      }
    }

    const patient = await prisma.patient.create({
      data: {
        ownerDoctorId: doctorId,
        firstName,
        lastNamePaternal,
        lastNameMaternal,
        phone,
        email,
        dateOfBirth,
      },
      select: {
        id: true,
        firstName: true,
        lastNamePaternal: true,
        lastNameMaternal: true,
        phone: true,
        email: true,
        dateOfBirth: true,
      },
    })

    return jsonNoStore(
      { success: true, patient },
      { status: 201 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
