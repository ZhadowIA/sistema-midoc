import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { getLegalStatusForUser } from '@/lib/legalAcceptance'
import { captureError } from '@/lib/observability'

export async function GET() {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const status = await getLegalStatusForUser(authUser.id)
    return NextResponse.json(status)
  } catch (error: unknown) {
    captureError('auth.legal.status.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
