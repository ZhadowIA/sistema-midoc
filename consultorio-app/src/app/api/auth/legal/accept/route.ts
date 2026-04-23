import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { getLegalStatusForUser, recordLegalAcceptance } from '@/lib/legalAcceptance'
import { captureError, logEvent } from '@/lib/observability'

export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const acceptTerms = body?.acceptTerms === true
    const acceptPrivacy = body?.acceptPrivacy === true
    if (!acceptTerms || !acceptPrivacy) {
      return NextResponse.json(
        { error: 'Debes aceptar Términos y Condiciones y Aviso de Privacidad' },
        { status: 400 }
      )
    }

    await recordLegalAcceptance({
      userId: authUser.id,
      request,
      context: 'REACCEPT',
    })

    const status = await getLegalStatusForUser(authUser.id)
    logEvent('info', 'auth.legal.reaccept', {
      userId: authUser.id,
      termsVersion: status.acceptedTermsVersion,
      privacyVersion: status.acceptedPrivacyVersion,
    })

    return NextResponse.json({ success: true, ...status })
  } catch (error: unknown) {
    captureError('auth.legal.accept.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
