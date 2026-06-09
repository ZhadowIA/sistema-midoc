import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(['ROOM', 'EQUIPMENT', 'UNIT']).optional(),
  notes: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
  if (access.response) return access.response
  const doctorId = access.context.doctorId
  const { id } = await props.params

  const existing = await prisma.resource.findFirst({ where: { id, doctorId } })
  if (!existing) return jsonNoStore({ error: 'Recurso no encontrado' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonNoStore({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const updated = await prisma.resource.update({
    where: { id },
    data: parsed.data,
  })

  return jsonNoStore(updated)
}

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
  if (access.response) return access.response
  const doctorId = access.context.doctorId
  const { id } = await props.params

  const existing = await prisma.resource.findFirst({ where: { id, doctorId } })
  if (!existing) return jsonNoStore({ error: 'Recurso no encontrado' }, { status: 404 })

  const hasAppointments = await prisma.appointment.count({ where: { resourceId: id } })
  if (hasAppointments > 0) {
    // soft-delete: deactivate instead of removing to preserve history
    await prisma.resource.update({ where: { id }, data: { active: false } })
    return jsonNoStore({ ok: true, deactivated: true })
  }

  await prisma.resource.delete({ where: { id } })
  return jsonNoStore({ ok: true, deleted: true })
}
