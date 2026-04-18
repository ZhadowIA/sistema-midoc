import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { hasMinimumForSignoff } from '@/lib/clinicalFormat'
import { EncounterHistoryPayloadSchema } from '@/lib/encounterHistorySchema'
import { hashSnapshot } from '@/lib/clinicalSignature'

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
  sign: z.boolean().optional(),
  historySnapshot: z.boolean().optional(),
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

    let snapshotEncounterId: string | null = null
    let signaturePayload: {
      signatureHash: string
      signedAt: Date
      signedByUserId: string
      signedSnapshot: Prisma.InputJsonValue
    } | null = null
    if (parsedBody.data.sign) {
      const encounter = await prisma.encounterHistory.findUnique({
        where: { appointmentId: params.id },
      })
      if (!encounter) {
        return jsonNoStore(
          { error: 'No se puede firmar: falta encuentro clínico de la cita.' },
          { status: 409 },
        )
      }
      const encounterPayload = EncounterHistoryPayloadSchema.safeParse(encounter.payload)
      if (!encounterPayload.success) {
        return jsonNoStore(
          { error: 'Encuentro clínico con formato inválido.' },
          { status: 409 },
        )
      }
      const check = hasMinimumForSignoff(encounterPayload.data)
      if (!check.ok) {
        return jsonNoStore(
          { error: 'Faltan mínimos clínicos para firmar', missing: check.missing },
          { status: 422 },
        )
      }
      snapshotEncounterId = encounter.id
      const snapshot = {
        encounterHistoryId: encounter.id,
        appointmentId: params.id,
        patientId: appointment.patientId,
        completionPct: encounter.completionPct,
        status: encounter.status,
        payload: encounterPayload.data,
        soap: {
          subjective: parsedBody.data.subjective,
          objective: parsedBody.data.objective,
          assessment: parsedBody.data.assessment,
          plan: parsedBody.data.plan,
        },
      }
      signaturePayload = {
        signatureHash: hashSnapshot(snapshot),
        signedAt: new Date(),
        signedByUserId: actorUserId,
        signedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      }
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
          ...(signaturePayload ?? {}),
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
          ...(signaturePayload ?? {}),
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

      if (parsedBody.data.sign) {
        await AppointmentAuditService.safeLog(
          {
            doctorId,
            appointmentId: params.id,
            patientId: appointment.patientId,
            actorType: 'DOCTOR',
            actorUserId,
            source: 'ADMIN_PANEL',
            action: 'CLINICAL_NOTE_SIGNED',
            ipAddress,
            userAgent,
            metadata: {
              encounterHistoryId: snapshotEncounterId,
              historySnapshot: parsedBody.data.historySnapshot ?? false,
              signatureHash: signaturePayload?.signatureHash ?? null,
            },
          },
          tx,
        )
      }

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
