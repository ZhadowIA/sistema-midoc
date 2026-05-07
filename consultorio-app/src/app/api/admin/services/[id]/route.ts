import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  price: z.number().nonnegative().max(999_999).optional(),
  sortOrder: z.number().int().optional(),
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

  const existing = await prisma.doctorService.findFirst({ where: { id, doctorId } })
  if (!existing) return jsonNoStore({ error: 'Servicio no encontrado' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonNoStore({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const updated = await prisma.doctorService.update({
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

  const existing = await prisma.doctorService.findFirst({ where: { id, doctorId } })
  if (!existing) return jsonNoStore({ error: 'Servicio no encontrado' }, { status: 404 })

  await prisma.doctorService.delete({ where: { id } })
  return jsonNoStore({ ok: true })
}
