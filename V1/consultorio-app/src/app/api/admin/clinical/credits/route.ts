import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { getCreditBalance, getTransactionHistory, allocateMonthlyCredits } from '@/lib/clinicalCredits'

export async function GET(request: Request) {
  const user = await getAuthenticatedUser()

  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'allocate') {
    try {
      await allocateMonthlyCredits(user.id)
      const balance = await getCreditBalance(user.id)
      return NextResponse.json({ success: true, balance })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al asignar créditos'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (action === 'history') {
    try {
      const limit = parseInt(searchParams.get('limit') || '50', 10)
      const transactions = await getTransactionHistory(user.id, limit)
      return NextResponse.json({ transactions })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al obtener historial'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  try {
    const balance = await getCreditBalance(user.id)
    return NextResponse.json(balance)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al obtener saldo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
