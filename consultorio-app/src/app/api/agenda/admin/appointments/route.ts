import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { can, PERMISSIONS } from '@/lib/permissions'
import {
  AgendaAppointmentForbiddenError,
  AgendaAppointmentInputError,
  createManualAppointment,
} from '@/server/agenda'
import { checkResourceConflict } from '@/lib/resourceConflict'

const env = getServerEnv()

const createPatientSchema = z.object({
  firstName: z.string().trim().min(1),
  lastNamePaternal: z.string().trim().min(1),
  lastNameMaternal: z.string().trim().optional().or(z.literal('')),
  phone: z.string().min(1, 'Teléfono requerido'),
  email: z.string().email().optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
})

const createManualAppointmentSchema = z.object({
  doctorId: z.string().min(1).optional(),
  patientId: z.string().min(1).optional(),
  createPatient: createPatientSchema.optional(),
  appointmentType: z.enum(['NORMAL', 'EXTENDED']),
  startTime: z.string().min(1, 'startTime requerido'),
  notes: z.string().optional(),
  resourceId: z.string().optional().nullable(),
  allowOutsidePublic: z.boolean().optional().default(true),
}).superRefine((value, ctx) => {
  const hasPatientId = Boolean(value.patientId)
  const hasCreatePatient = Boolean(value.createPatient)

  if (hasPatientId === hasCreatePatient) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debes seleccionar un paciente existente o capturar uno nuevo.',
      path: ['patientId'],
    })
  }
})

export async function POST(request: Request) {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.APPOINTMENT_CREATE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const parsed = createManualAppointmentSchema.safeParse(await request.json())
    if (!parsed.success) {
      const issues = parsed.error.issues
      return NextResponse.json({ error: 'Payload inválido', details: issues }, { status: 400 })
    }
    const normalized = parsed.data
    const result = await createManualAppointment(prisma, {
      actorUserId: authUser.id,
      actorRole: authUser.role,
      canManageDoctors: can(authUser, PERMISSIONS.CLINIC_MANAGE_DOCTORS),
      doctorId: normalized.doctorId,
      patientId: normalized.patientId,
      createPatient: normalized.createPatient,
      appointmentType: normalized.appointmentType,
      startTime: normalized.startTime,
      notes: normalized.notes,
      allowOutsidePublic: normalized.allowOutsidePublic,
      appBaseUrl: env.APP_BASE_URL,
    })

    if (normalized.resourceId) {
      const apptId = result.appointment.id
      const appt = await prisma.appointment.findUnique({
        where: { id: apptId },
        select: { startTime: true, endTime: true },
      })
      if (appt) {
        const { conflict } = await checkResourceConflict({
          resourceId: normalized.resourceId,
          startTime: appt.startTime,
          endTime: appt.endTime,
          excludeAppointmentId: apptId,
        })
        if (conflict) {
          return NextResponse.json(
            { ...result, resourceConflict: true },
            { status: 201 }
          )
        }
        await prisma.appointment.update({
          where: { id: apptId },
          data: { resourceId: normalized.resourceId },
        })
      }
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof AgendaAppointmentForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof AgendaAppointmentInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
