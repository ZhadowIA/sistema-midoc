import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
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
})

async function loadEncounter(id: string, doctorId: string) {
  return prisma.clinicalEncounter.findFirst({
    where: { id, doctorId },
    select: { id: true, appointmentId: true, patientId: true },
  })
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const encounter = await loadEncounter(params.id, doctorId)
    if (!encounter) return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })

    const note = await prisma.clinicalNote.findFirst({
      where: { clinicalEncounterId: params.id, doctorId },
      include: { prescriptions: true },
    })

    return jsonNoStore(note || {})
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    const actorUserId = access.context.user.id

    const encounter = await loadEncounter(params.id, doctorId)
    if (!encounter) return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })

    const body = await request.json()
    const parsedBody = clinicalNoteSchema.safeParse(body)
    if (!parsedBody.success) {
      return jsonNoStore({ error: 'Datos inválidos', details: parsedBody.error.issues }, { status: 400 })
    }

    let signaturePayload: {
      signatureHash: string
      signedAt: Date
      signedByUserId: string
      signedSnapshot: Prisma.InputJsonValue
    } | null = null

    if (parsedBody.data.sign) {
      const history = await prisma.encounterHistory.findUnique({
        where: { clinicalEncounterId: params.id },
      })
      if (!history) {
        return jsonNoStore(
          { error: 'No se puede firmar: falta encuentro clínico.' },
          { status: 409 },
        )
      }
      const encounterPayload = EncounterHistoryPayloadSchema.safeParse(history.payload)
      if (!encounterPayload.success) {
        return jsonNoStore({ error: 'Encuentro clínico con formato inválido.' }, { status: 409 })
      }
      const check = hasMinimumForSignoff(encounterPayload.data)
      if (!check.ok) {
        return jsonNoStore({ error: 'Faltan mínimos clínicos para firmar', missing: check.missing }, { status: 422 })
      }
      const snapshot = {
        encounterHistoryId: history.id,
        clinicalEncounterId: params.id,
        appointmentId: encounter.appointmentId,
        patientId: encounter.patientId,
        completionPct: history.completionPct,
        status: history.status,
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
        signedSnapshot: snapshot as Prisma.InputJsonValue,
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const note = await tx.clinicalNote.upsert({
        where: { clinicalEncounterId: params.id },
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
          appointmentId: encounter.appointmentId ?? undefined,
          clinicalEncounterId: params.id,
          doctorId,
          patientId: encounter.patientId,
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
      })

      if (parsedBody.data.prescriptions) {
        await tx.prescription.deleteMany({ where: { clinicalNoteId: note.id } })
        if (parsedBody.data.prescriptions.length > 0) {
          await tx.prescription.createMany({
            data: parsedBody.data.prescriptions.map((prescription) => ({
              clinicalNoteId: note.id,
              medication: prescription.medication,
              dosage: prescription.dosage,
              frequency: prescription.frequency,
              duration: prescription.duration,
              instructions: prescription.instructions || null,
            })),
          })
        }
      }

      return tx.clinicalNote.findUnique({
        where: { id: note.id },
        include: { prescriptions: true },
      })
    })

    return jsonNoStore(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
