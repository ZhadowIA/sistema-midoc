import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  price: z.number().nonnegative().max(999_999),
  sortOrder: z.number().int().optional().default(0),
})

export async function GET() {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
  if (access.response) return access.response
  const doctorId = access.context.doctorId

  const services = await prisma.doctorService.findMany({
    where: { doctorId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return jsonNoStore({ services })
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

  const service = await prisma.doctorService.create({
    data: {
      doctorId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price: parsed.data.price,
      sortOrder: parsed.data.sortOrder,
    },
  })

  return jsonNoStore(service, { status: 201 })
}
