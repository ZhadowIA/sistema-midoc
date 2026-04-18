import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'

const prescriptionSchema = z.object({
  medication: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(200).optional().default(''),
  frequency: z.string().trim().max(200).optional().default(''),
  duration: z.string().trim().max(200).optional().default(''),
  instructions: z.string().trim().max(1000).optional().nullable(),
})

const clinicalNoteSchema = z.object({
  subjective: z.string().trim().max(10_000).optional().default(''),
  objective: z.string().trim().max(10_000).optional().default(''),
  assessment: z.string().trim().max(10_000).optional().default(''),
  plan: z.string().trim().max(10_000).optional().default(''),
  privateNotes: z.string().trim().max(10_000).optional().default(''),
  prescriptions: z.array(prescriptionSchema).max(50).optional(),
})

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    // Validar propiedad de cita
    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true },
    })
    if (!appointment) return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })

    const note = await prisma.clinicalNote.findUnique({
      where: { appointmentId: params.id },
      include: { prescriptions: true }
    })

    return jsonNoStore(note || {})
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    const actorUserId = access.context.user.id
    const ipAddress = getRequestIp(request)
    const userAgent = getUserAgent(request)

    // Verify appointment ownership
    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      select: { patientId: true },
    })

    if (!appointment) return jsonNoStore({ error: 'Operación no válida' }, { status: 403 })

    const body = await request.json()
    const parsedBody = clinicalNoteSchema.safeParse(body)
    if (!parsedBody.success) {
      return jsonNoStore({ error: 'Datos inválidos', details: parsedBody.error.issues }, { status: 400 })
    }

    // Usamos transaction para actualizar la nota y las recetas
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const note = await tx.clinicalNote.upsert({
        where: { appointmentId: params.id },
        update: {
          subjective: parsedBody.data.subjective,
          objective: parsedBody.data.objective,
          assessment: parsedBody.data.assessment,
          plan: parsedBody.data.plan,
          privateNotes: parsedBody.data.privateNotes,
          soapPayload: {
            subjective: parsedBody.data.subjective,
            objective: parsedBody.data.objective,
            assessment: parsedBody.data.assessment,
            plan: parsedBody.data.plan,
          },
        },
        create: {
          appointmentId: params.id,
          doctorId,
          patientId: appointment.patientId,
          subjective: parsedBody.data.subjective,
          objective: parsedBody.data.objective,
          assessment: parsedBody.data.assessment,
          plan: parsedBody.data.plan,
          privateNotes: parsedBody.data.privateNotes,
          soapPayload: {
            subjective: parsedBody.data.subjective,
            objective: parsedBody.data.objective,
            assessment: parsedBody.data.assessment,
            plan: parsedBody.data.plan,
          },
        }
      })

      // Actualizar prescripciones (borrar todas y crear las nuevas enviadas)
      if (parsedBody.data.prescriptions) {
        await tx.prescription.deleteMany({
          where: { clinicalNoteId: note.id }
        })

        if (parsedBody.data.prescriptions.length > 0) {
          await tx.prescription.createMany({
            data: parsedBody.data.prescriptions.map((prescription) => ({
              clinicalNoteId: note.id,
              medication: prescription.medication,
              dosage: prescription.dosage,
              frequency: prescription.frequency,
              duration: prescription.duration,
              instructions: prescription.instructions || null
            }))
          })
        }
      }

      await AppointmentAuditService.safeLog(
        {
          doctorId,
          appointmentId: params.id,
          patientId: appointment.patientId,
          actorType: 'DOCTOR',
          actorUserId,
          source: 'ADMIN_PANEL',
          action: 'CLINICAL_NOTE_UPDATED',
          ipAddress,
          userAgent,
          metadata: {
            updatedByApi: true,
            prescriptionCount: parsedBody.data.prescriptions?.length ?? 0,
          },
        },
        tx
      )

      return await tx.clinicalNote.findUnique({
        where: { id: note.id },
        include: { prescriptions: true }
      })
    })

    return jsonNoStore(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
