import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'

const schema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED']),
  resolutionText: z.string().max(4000).optional(),
  evidenceRef: z.string().max(500).optional(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || (authUser.role !== 'DOCTOR' && authUser.role !== 'ADMIN' && authUser.role !== 'CLINIC_ADMIN')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    const updated = await prisma.arcoRequest.update({
      where: { id: params.id },
      data: {
        status: parsed.data.status,
        resolutionText: parsed.data.resolutionText,
        evidenceRef: parsed.data.evidenceRef,
        resolvedByUserId: parsed.data.status === 'RESOLVED' || parsed.data.status === 'REJECTED' ? authUser.id : null,
        resolvedAt: parsed.data.status === 'RESOLVED' || parsed.data.status === 'REJECTED' ? new Date() : null,
      },
    })

    return NextResponse.json({ success: true, request: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}