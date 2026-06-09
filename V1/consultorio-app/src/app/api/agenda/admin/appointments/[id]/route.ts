import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'
import { can, PERMISSIONS } from '@/lib/permissions'
import { safeLogClinicalAccess } from '@/lib/clinicalAudit'
import {
  AgendaAppointmentConflictError,
  AgendaAppointmentForbiddenError,
  AgendaAppointmentInputError,
  AgendaAppointmentNotFoundError,
  getAppointmentById,
  patchAppointmentByAction,
} from '@/server/agenda'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.APPOINTMENT_UPDATE)) {
      return jsonNoStore({ error: 'No autorizado' }, { status: 403 })
    }

    const appointment = await getAppointmentById(prisma, {
      actorUserId: authUser.id,
      appointmentId: params.id,
    })

    await safeLogClinicalAccess({
      request,
      action: 'CLINICAL_APPOINTMENT_VIEWED',
      doctorId: appointment.doctorId,
      actorUserId: authUser.id,
      patientId: appointment.patientId ?? null,
      appointmentId: appointment.id,
      metadata: { route: '/api/agenda/admin/appointments/[id]' },
    })

    return jsonNoStore(appointment)
  } catch (error: unknown) {
    if (error instanceof AgendaAppointmentNotFoundError) {
      return jsonNoStore({ error: error.message }, { status: 404 })
    }
    if (error instanceof AgendaAppointmentForbiddenError) {
      return jsonNoStore({ error: error.message }, { status: 403 })
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      const message = error.message.includes('ownerDoctorId')
        ? 'El servidor requiere reinicio para cargar cambios de base de datos. Detén y vuelve a iniciar la app.'
        : 'Datos inválidos para actualizar la cita.'
      return jsonNoStore({ error: message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.APPOINTMENT_UPDATE)) {
      return jsonNoStore({ error: 'No autorizado' }, { status: 403 })
    }
    const ipAddress = getRequestIp(request)
    const userAgent = getUserAgent(request)

    const body = (await request.json()) as Record<string, unknown>
    const updated = await patchAppointmentByAction({
      prisma,
      actorUserId: authUser.id,
      appointmentId: params.id,
      body,
      ipAddress,
      userAgent,
    })
    return jsonNoStore(updated)
  } catch (error: unknown) {
    if (error instanceof AgendaAppointmentNotFoundError) {
      return jsonNoStore({ error: error.message }, { status: 404 })
    }
    if (error instanceof AgendaAppointmentForbiddenError) {
      return jsonNoStore({ error: error.message }, { status: 403 })
    }
    if (error instanceof AgendaAppointmentInputError) {
      return jsonNoStore({ error: error.message }, { status: 400 })
    }
    if (error instanceof AgendaAppointmentConflictError) {
      return jsonNoStore(
        { error: error.code, message: error.message },
        { status: 409 },
      )
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      const message = error.message.includes('ownerDoctorId')
        ? 'El servidor requiere reinicio para cargar cambios de base de datos. Detén y vuelve a iniciar la app.'
        : 'Datos inválidos para actualizar la cita.'
      return jsonNoStore({ error: message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
