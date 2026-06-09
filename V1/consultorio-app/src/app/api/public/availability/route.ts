import { NextResponse } from 'next/server'
import { AvailabilityService } from '@/services/AvailabilityService'
import prisma from '@/lib/prisma'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import { ContractValidationError, parseAvailabilityDayQuery } from '@/lib/publicApiContracts'

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(request, {
    key: 'public:availability:day',
    limit: 120,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

  const { searchParams } = new URL(request.url)
  try {
    const { date, type, doctorId } = parseAvailabilityDayQuery({
      date: searchParams.get('date') ?? '',
      type: searchParams.get('type') ?? '',
      doctorId: searchParams.get('doctorId') ?? '',
    })

    const doctor = await prisma.user.findFirst({
      where: {
        id: doctorId,
        active: true,
        role: { in: ['ADMIN', 'DOCTOR'] },
      },
      select: { id: true },
    })
    if (!doctor) throw new Error("El médico no existe")

    const availability = await AvailabilityService.getAvailability(doctor.id, date, type)
    return NextResponse.json(availability)
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
