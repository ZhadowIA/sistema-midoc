import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'

const querySchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,80}$/i, 'Slug inválido')
    .optional(),
})

export async function GET(request: Request) {
  const rateLimit = checkRateLimit(request, {
    key: 'public:doctors',
    limit: 90,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

  const { searchParams } = new URL(request.url)
  const parsedQuery = querySchema.safeParse({
    slug: searchParams.get('slug') ?? undefined,
  })

  if (!parsedQuery.success) {
    return NextResponse.json({ error: 'Parámetros inválidos', details: parsedQuery.error.issues }, { status: 400 })
  }

  const { slug } = parsedQuery.data

  try {
    if (slug) {
      const doctor = await prisma.user.findFirst({
        where: { slug, active: true, role: { in: ['ADMIN', 'DOCTOR'] } },
        select: {
          id: true,
          name: true,
          specialty: true,
          slug: true,
          bio: true,
          profileImage: true,
        }
      })
      if (!doctor) return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
      return NextResponse.json(doctor)
    }

    const doctors = await prisma.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'DOCTOR'] } },
      select: {
        id: true,
        name: true,
        specialty: true,
        slug: true,
        bio: true,
        profileImage: true,
      },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json(doctors)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
