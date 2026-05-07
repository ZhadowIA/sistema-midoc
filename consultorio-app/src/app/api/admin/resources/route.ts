import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['ROOM', 'EQUIPMENT', 'UNIT']).default('ROOM'),
  notes: z.string().max(500).optional().nullable(),
  clinicId: z.string().optional().nullable(),
})

export async function GET(request: Request) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
  if (access.response) return access.response
  const doctorId = access.context.doctorId

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('includeInactive') === 'true'

  const resources = await prisma.resource.findMany({
    where: { doctorId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })

  return jsonNoStore({ resources })
}

export async function POST(request: Request) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
  if (access.response) return access.response
  const doctorId = access.context.doctorId

  const body = await request.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return jsonNoStore({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const resource = await prisma.resource.create({
    data: {
      doctorId,
      name: parsed.data.name,
      type: parsed.data.type,
      notes: parsed.data.notes ?? null,
      clinicId: parsed.data.clinicId ?? null,
    },
  })

  return jsonNoStore(resource, { status: 201 })
}
