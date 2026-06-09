import { jsonNoStore } from '@/lib/http'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'

const schema = z.object({
  step: z.enum([
    'BOOKING_VISIT',
    'BOOKING_STARTED',
    'DOCTOR_SELECTED',
    'SLOT_SELECTED',
    'PATIENT_INFO_STARTED',
    'PATIENT_INFO_COMPLETED',
    'BOOKING_CONFIRMED',
    'PAYMENT_STARTED',
    'PAYMENT_COMPLETED',
    'APPOINTMENT_COMPLETED',
  ]),
  sessionId: z.string().min(1).max(128),
  channel: z.enum([
    'INSTAGRAM',
    'WHATSAPP',
    'GOOGLE_BUSINESS',
    'WEBSITE',
    'CAMPAIGN',
    'MANUAL',
    'UNKNOWN',
  ]).default('UNKNOWN'),
  utmSource: z.string().max(100).nullable().optional(),
  utmMedium: z.string().max(100).nullable().optional(),
  utmCampaign: z.string().max(100).nullable().optional(),
  utmContent: z.string().max(100).nullable().optional(),
  referrer: z.string().max(500).nullable().optional(),
  doctorId: z.string().nullable().optional(),
  appointmentId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit(req, {
    key: 'funnel:event',
    limit: 60,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonNoStore({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonNoStore({ error: 'Invalid payload' }, { status: 400 })
  }

  const data = parsed.data

  await prisma.bookingFunnelEvent.create({
    data: {
      sessionId: data.sessionId,
      step: data.step,
      channel: data.channel,
      utmSource: data.utmSource ?? null,
      utmMedium: data.utmMedium ?? null,
      utmCampaign: data.utmCampaign ?? null,
      utmContent: data.utmContent ?? null,
      referrer: data.referrer ?? null,
      doctorId: data.doctorId ?? null,
      appointmentId: data.appointmentId ?? null,
      metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
    },
  })

  return jsonNoStore({ ok: true })
}
