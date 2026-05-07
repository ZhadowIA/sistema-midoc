import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import {
  AvailabilityConflictError,
  AvailabilityInputError,
  createAvailabilityBlock,
  getAvailabilityBlocks,
} from '@/server/agenda'

const createAvailabilitySchema = z.object({
  date: z.string().optional(),
  startTime: z.string().min(1, 'startTime requerido'),
  endTime: z.string().min(1, 'endTime requerido'),
  isPublic: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true),
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const isPublic = searchParams.get('isPublic')
  const active = searchParams.get('active')

  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const result = await getAvailabilityBlocks(prisma, {
      doctorId,
      date,
      from,
      to,
      isPublic,
      active,
    })

    return NextResponse.json(result)
  } catch (error: unknown) {
    if (error instanceof AvailabilityInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const payload = createAvailabilitySchema.parse(await request.json())

    const result = await createAvailabilityBlock(prisma, { doctorId, ...payload })
    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload inválido', details: error.issues }, { status: 400 })
    }
    if (error instanceof AvailabilityConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof AvailabilityInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
