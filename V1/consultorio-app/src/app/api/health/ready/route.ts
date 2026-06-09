import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { captureError } from '@/lib/observability'

export async function GET() {
  const started = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ready',
      dbLatencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    captureError('health.ready.db_unreachable', error)
    return NextResponse.json(
      {
        status: 'not_ready',
        reason: 'db_unreachable',
        dbLatencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
