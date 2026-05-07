import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'

export async function POST(request: Request) {
  const env = getServerEnv()
  const expectedSecret = env.NOTIFICATION_CRON_SECRET ?? ''
  const providedSecret = request.headers.get('x-cron-secret') ?? ''

  const provided = Buffer.from(providedSecret)
  const expected = Buffer.from(expectedSecret)
  const valid = expectedSecret.length > 0 && provided.length === expected.length && timingSafeEqual(provided, expected)
  if (!valid) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const result = await prisma.shortLink.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })

  return NextResponse.json({ deleted: result.count })
}
