import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { checkResourceConflict } from '@/lib/resourceConflict'

const patchSchema = z.object({
  resourceId: z.string().nullable(),
})

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
  if (access.response) return access.response
  const doctorId = access.context.doctorId
  const { id } = await props.params

  const appointment = await prisma.appointment.findFirst({
    where: { id, doctorId },
    select: { id: true, startTime: true, endTime: true, status: true },
  })
  if (!appointment) return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return jsonNoStore({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const { resourceId } = parsed.data

  if (resourceId !== null) {
    const resource = await prisma.resource.findFirst({ where: { id: resourceId, doctorId, active: true } })
    if (!resource) return jsonNoStore({ error: 'Recurso no encontrado o inactivo' }, { status: 404 })

    const { conflict, conflictingAppointmentId } = await checkResourceConflict({
      resourceId,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      excludeAppointmentId: appointment.id,
    })
    if (conflict) {
      return jsonNoStore(
        { error: 'El recurso ya está ocupado en ese horario', conflictingAppointmentId },
        { status: 409 }
      )
    }
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { resourceId },
    select: { id: true, resourceId: true, resource: { select: { id: true, name: true, type: true } } },
  })

  return jsonNoStore(updated)
}
