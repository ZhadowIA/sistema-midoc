import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { WaitlistService } from '@/services/WaitlistService'

const payloadSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
})

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const parsed = payloadSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    const offer = await prisma.waitlistOffer.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        patient: {
          select: {
            userId: true,
          },
        },
      },
    })

    if (!offer || offer.patient.userId !== authUser.id) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 })
    }

    const result = await WaitlistService.respondToOffer({
      offerId: offer.id,
      decision: parsed.data.decision,
      actorType: 'PATIENT',
      actorUserId: authUser.id,
      source: 'PATIENT_PORTAL',
    })

    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status =
      message === 'WAITLIST_OFFER_EXPIRED' || message === 'WAITLIST_OFFER_NOT_ACTIONABLE' || message === 'WAITLIST_SLOT_TAKEN'
        ? 409
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}