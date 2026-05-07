import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'

export async function GET(
  request: Request,
  props: { params: Promise<{ slug: string }> }
) {
  const rateLimit = await checkRateLimit(request, {
    key: 'public:doctor-profile',
    limit: 120,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

  const { slug } = await props.params

  const doctor = await prisma.user.findFirst({
    where: { slug, active: true, role: { in: ['ADMIN', 'DOCTOR'] } },
    select: {
      id: true,
      name: true,
      specialty: true,
      slug: true,
      bio: true,
      profileImage: true,
      logoImage: true,
      professionalLicense: true,
      clinicAddress: true,
      doctorConfig: {
        select: {
          consultationDurationMin: true,
          normalConsultationPrice: true,
          extendedConsultationEnabled: true,
          extendedConsultationPrice: true,
        },
      },
      doctorServices: {
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, description: true, price: true },
      },
    },
  })

  if (!doctor) return NextResponse.json({ error: 'Médico no encontrado' }, { status: 404 })

  return NextResponse.json(doctor)
}
