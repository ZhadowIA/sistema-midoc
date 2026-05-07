import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import prisma from '@/lib/prisma'
import { NotificationStatus } from '@prisma/client'

// Twilio signs each webhook with HMAC-SHA1 using the auth token
function verifyTwilioSignature(request: Request, body: string, signature: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false

  const url = process.env.APP_BASE_URL + '/api/internal/twilio/status'
  const hmac = createHmac('sha1', authToken).update(url + body).digest('base64')

  const provided = Buffer.from(signature)
  const expected = Buffer.from(hmac)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

// Maps Twilio MessageStatus to our NotificationStatus
function resolveStatus(twilioStatus: string): NotificationStatus | null {
  switch (twilioStatus) {
    case 'delivered': return NotificationStatus.SENT
    case 'failed':
    case 'undelivered': return NotificationStatus.FAILED
    default: return null
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-twilio-signature') ?? ''

  if (!verifyTwilioSignature(request, rawBody, signature)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  const messageSid = params.get('MessageSid')
  const twilioStatus = params.get('MessageStatus') ?? ''
  const errorCode = params.get('ErrorCode')

  if (!messageSid) {
    return NextResponse.json({ error: 'MessageSid requerido' }, { status: 400 })
  }

  const newStatus = resolveStatus(twilioStatus)
  if (!newStatus) {
    return new NextResponse(null, { status: 204 })
  }

  await prisma.notification.updateMany({
    where: { externalId: messageSid, status: NotificationStatus.SENT },
    data: {
      status: newStatus,
      ...(newStatus === NotificationStatus.FAILED && errorCode
        ? { externalId: `FAILED:Twilio error ${errorCode} (sid:${messageSid})` }
        : {}),
    },
  })

  return new NextResponse(null, { status: 204 })
}
