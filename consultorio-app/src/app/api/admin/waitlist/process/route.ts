import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { WaitlistService } from '@/services/WaitlistService'

export async function POST() {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || (authUser.role !== 'DOCTOR' && authUser.role !== 'ADMIN' && authUser.role !== 'CLINIC_ADMIN')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const expiredCount = await WaitlistService.expireDueOffers()
    return NextResponse.json({ success: true, expiredCount })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}