import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { can, PERMISSIONS } from '@/lib/permissions'
import {
  AgendaBlockConflictError,
  AgendaBlockForbiddenError,
  AgendaBlockInputError,
  createScheduleBlock,
} from '@/server/agenda'

const createBlockSchema = z.object({
  doctorId: z.string().min(1).optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  reason: z.string().optional(),
  type: z.enum(['BLOCKED', 'PRIVATE_RESERVED']).default('BLOCKED'),
})

export async function POST(request: Request) {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.APPOINTMENT_UPDATE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createBlockSchema.parse(body)
    const result = await createScheduleBlock(prisma, {
      actorUserId: authUser.id,
      canManageDoctors: can(authUser, PERMISSIONS.CLINIC_MANAGE_DOCTORS),
      doctorId: parsed.doctorId,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      reason: parsed.reason,
      type: parsed.type,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload inválido', details: error.issues }, { status: 400 })
    }
    if (error instanceof AgendaBlockForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof AgendaBlockInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof AgendaBlockConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
