import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { formatPatientName } from '@/lib/patientName'

const linkAccountSchema = z.object({
  email: z.string().email('Correo inválido'),
})

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const body = await request.json()
    const parsed = linkAccountSchema.safeParse(body)
    if (!parsed.success) {
      return jsonNoStore({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    const email = parsed.data.email.trim().toLowerCase()

    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      include: {
        appointments: {
          where: { doctorId },
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!patient) return jsonNoStore({ error: 'Paciente no encontrado' }, { status: 404 })
    const isOwnedByDoctor = patient.ownerDoctorId === doctorId || patient.appointments.length > 0
    if (!isOwnedByDoctor) {
      return jsonNoStore({ error: 'No autorizado para modificar este paciente' }, { status: 403 })
    }

    const patientUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    })

    if (!patientUser || !patientUser.active || patientUser.role !== 'PATIENT') {
      return jsonNoStore({ error: 'No existe una cuenta de paciente activa con ese correo' }, { status: 404 })
    }

    if (patient.userId && patient.userId !== patientUser.id) {
      return jsonNoStore(
        { error: 'Este paciente ya está vinculado a otra cuenta. Desvincúlalo antes de cambiarlo.' },
        { status: 409 }
      )
    }

    const alreadyLinkedForDoctor = await prisma.patient.findFirst({
      where: {
        id: { not: patient.id },
        userId: patientUser.id,
        OR: [
          { ownerDoctorId: doctorId },
          {
            appointments: {
              some: { doctorId },
            },
          },
        ],
      },
      select: { id: true, firstName: true, lastNamePaternal: true, lastNameMaternal: true },
    })

    if (alreadyLinkedForDoctor) {
      return jsonNoStore(
        {
          error: 'Esta cuenta ya está vinculada a otro expediente de este médico.',
          existingPatientId: alreadyLinkedForDoctor.id,
          existingPatientName: formatPatientName(alreadyLinkedForDoctor),
        },
        { status: 409 }
      )
    }

    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        ownerDoctorId: patient.ownerDoctorId || doctorId,
        userId: patientUser.id,
        email: patient.email || patientUser.email,
      },
    })

    return jsonNoStore({
      success: true,
      linkedAccount: {
        id: patientUser.id,
        name: patientUser.name,
        email: patientUser.email,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
