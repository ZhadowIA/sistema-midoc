import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { z } from 'zod'
import { parseDateOnlyLocal } from '@/lib/dateTime'

const createPatientSchema = z.object({
  fullName: z.string().min(2, 'Nombre requerido'),
  phone: z.string().min(7, 'Teléfono requerido'),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
})

export async function GET() {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
      orderBy: { fullName: 'asc' }
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

    return NextResponse.json(payload)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const parsed = createPatientSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
    }

    const fullName = parsed.data.fullName.trim()
    const phone = parsed.data.phone.trim()
    const email = parsed.data.email?.trim().toLowerCase() || null

    const duplicate = await prisma.patient.findFirst({
      where: {
        ownerDoctorId: doctorId,
        fullName,
        phone,
      },
      select: { id: true },
    })

    if (duplicate) {
      return NextResponse.json(
        { error: 'Ya existe un paciente con ese nombre y teléfono en tu directorio.' },
        { status: 409 }
      )
    }

    let dateOfBirth = new Date()
    if (parsed.data.dateOfBirth) {
      try {
        dateOfBirth = parseDateOnlyLocal(parsed.data.dateOfBirth)
      } catch {
        return NextResponse.json({ error: 'Fecha de nacimiento inválida' }, { status: 400 })
      }
    }

    const patient = await prisma.patient.create({
      data: {
        ownerDoctorId: doctorId,
        fullName,
        phone,
        email,
        dateOfBirth,
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        dateOfBirth: true,
      },
    })

    return NextResponse.json({ success: true, patient }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
