import { NextResponse } from 'next/server'
import { AvailabilityService } from '@/services/AvailabilityService'
import prisma from '@/lib/prisma'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import { ContractValidationError, parseAvailabilityMonthQuery } from '@/lib/publicApiContracts'

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(request, {
    key: 'public:availability:month',
    limit: 90,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

  const { searchParams } = new URL(request.url)
  try {
    const { startDate, endDate, type, doctorId } = parseAvailabilityMonthQuery({
      startDate: searchParams.get('startDate') ?? '',
      endDate: searchParams.get('endDate') ?? '',
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

    const availableDates = await AvailabilityService.getAvailableDatesInMonth(doctor.id, startDate, endDate, type)
    return NextResponse.json({ dates: availableDates })
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
