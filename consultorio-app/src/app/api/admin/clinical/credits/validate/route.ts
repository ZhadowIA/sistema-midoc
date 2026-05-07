import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { checkCredits, consumeCredits, type CreditType } from '@/lib/clinicalCredits'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()

  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { action, creditType } = await request.json()

    if (action === 'check') {
      if (!creditType) {
        return NextResponse.json(
          { error: 'creditType es requerido' },
          { status: 400 }
        )
      }
      const result = await checkCredits(user.id, creditType as CreditType)
      return NextResponse.json(result)
    }

    if (action === 'consume') {
      if (!creditType) {
        return NextResponse.json(
          { error: 'creditType es requerido' },
          { status: 400 }
        )
      }
      const success = await consumeCredits(
        user.id,
        creditType as CreditType,
        `API call: ${creditType}`
      )
      if (!success) {
        return NextResponse.json(
          { error: 'Saldo insuficiente de créditos' },
          { status: 402 }
        )
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Acción inválida' },
      { status: 400 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al validar créditos'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
