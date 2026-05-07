import prisma from '@/lib/prisma'
import { z } from 'zod'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'

const mergeSchema = z
  .object({
    primaryPatientId: z.string().min(1, 'primaryPatientId es requerido'),
    secondaryPatientId: z.string().min(1, 'secondaryPatientId es requerido'),
  })
  .refine((input) => input.primaryPatientId !== input.secondaryPatientId, {
    message: 'IDs de paciente inválidos',
    path: ['secondaryPatientId'],
  })

class MergePatientError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function mergeTextFields(primary: string | null, secondary: string | null) {
  const pieces = [primary, secondary]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  return Array.from(new Set(pieces)).join(' | ') || null
}

export async function POST(request: Request) {
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const body = await request.json()
    const parsed = mergeSchema.safeParse(body)
    if (!parsed.success) {
      return jsonNoStore({ error: 'IDs de paciente inválidos', details: parsed.error.issues }, { status: 400 })
    }

    const { primaryPatientId, secondaryPatientId } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      const [requestedPrimary, requestedSecondary] = await Promise.all([
        tx.patient.findUnique({
          where: { id: primaryPatientId },
          include: {
            medicalRecord: true,
            appointments: {
              where: { doctorId },
              select: { id: true },
              take: 1,
            },
          },
        }),
        tx.patient.findUnique({
          where: { id: secondaryPatientId },
          include: {
            medicalRecord: true,
            appointments: {
              where: { doctorId },
              select: { id: true },
              take: 1,
            },
          },
        }),
      ])

      if (!requestedPrimary || !requestedSecondary) {
        throw new MergePatientError('Paciente no encontrado.', 404)
      }

      const primaryOwnedByDoctor =
        requestedPrimary.ownerDoctorId === doctorId || requestedPrimary.appointments.length > 0
      const secondaryOwnedByDoctor =
        requestedSecondary.ownerDoctorId === doctorId || requestedSecondary.appointments.length > 0

      if (!primaryOwnedByDoctor || !secondaryOwnedByDoctor) {
        throw new MergePatientError('No autorizado para fusionar estos pacientes.', 403)
      }

      if (
        requestedPrimary.userId &&
        requestedSecondary.userId &&
        requestedPrimary.userId !== requestedSecondary.userId
      ) {
        throw new MergePatientError(
          'No se puede fusionar porque ambos pacientes tienen cuentas diferentes vinculadas.',
          409
        )
      }

      let survivorPatientId = requestedPrimary.id
      let mergedPatientId = requestedSecondary.id
      let mergeReason: 'requested_primary' | 'account_priority' = 'requested_primary'

      const primaryHasAccount = Boolean(requestedPrimary.userId)
      const secondaryHasAccount = Boolean(requestedSecondary.userId)

      if (!primaryHasAccount && secondaryHasAccount) {
        survivorPatientId = requestedSecondary.id
        mergedPatientId = requestedPrimary.id
        mergeReason = 'account_priority'
      }

      // 1. Mover citas
      await tx.appointment.updateMany({
        where: { patientId: mergedPatientId, doctorId },
        data: { patientId: survivorPatientId },
      })

      // 2. Mover notas clínicas
      await tx.clinicalNote.updateMany({
        where: { patientId: mergedPatientId, doctorId },
        data: { patientId: survivorPatientId },
      })

      // 3. Fusión de Expediente Médico Fijo (MedicalRecord)
      const primaryRecord = await tx.medicalRecord.findUnique({ where: { patientId: survivorPatientId } })
      const secondaryRecord = await tx.medicalRecord.findUnique({ where: { patientId: mergedPatientId } })

      if (secondaryRecord) {
        if (!primaryRecord) {
          // Si el paciente sobreviviente no tenía expediente, le asignamos el existente.
          await tx.medicalRecord.update({
            where: { id: secondaryRecord.id },
            data: { patientId: survivorPatientId },
          })
        } else {
          // Si ambos tenían expediente, fusionamos conservando el dato principal cuando existe.
          await tx.medicalRecord.update({
            where: { id: primaryRecord.id },
            data: {
              bloodType: primaryRecord.bloodType || secondaryRecord.bloodType,
              allergies: mergeTextFields(primaryRecord.allergies, secondaryRecord.allergies),
              chronicConditions: mergeTextFields(primaryRecord.chronicConditions, secondaryRecord.chronicConditions),
              familyHistory: mergeTextFields(primaryRecord.familyHistory, secondaryRecord.familyHistory),
            },
          })
        }
      }

      const [remainingAppointments, remainingClinicalNotes] = await Promise.all([
        tx.appointment.count({ where: { patientId: mergedPatientId } }),
        tx.clinicalNote.count({ where: { patientId: mergedPatientId } }),
      ])

      if (remainingAppointments > 0 || remainingClinicalNotes > 0) {
        throw new MergePatientError(
          'No se puede fusionar: el paciente secundario tiene registros vinculados fuera del contexto actual.',
          409
        )
      }

      // 4. Eliminar el paciente fusionado.
      await tx.patient.update({
        where: { id: survivorPatientId },
        data: { ownerDoctorId: doctorId },
      })

      await tx.patient.delete({
        where: { id: mergedPatientId },
      })

      return {
        primaryPatientId: survivorPatientId,
        mergedPatientId,
        mergeReason,
      }
    })

    return jsonNoStore({
      success: true,
      message: 'Pacientes unificados correctamente',
      ...result,
    })
  } catch (error: unknown) {
    if (error instanceof MergePatientError) {
      return jsonNoStore({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
