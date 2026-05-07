import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import {
  AvailabilityConflictError,
  AvailabilityInputError,
  AvailabilityNotFoundError,
  deleteAvailabilityBlock,
  updateAvailabilityBlock,
} from '@/server/agenda'

const updateAvailabilitySchema = z
  .object({
    date: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    isPublic: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.date !== undefined ||
      data.startTime !== undefined ||
      data.endTime !== undefined ||
      data.isPublic !== undefined ||
      data.active !== undefined,
    { message: 'No hay campos para actualizar.' }
  )

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const payload = updateAvailabilitySchema.parse(await request.json())

    const result = await updateAvailabilityBlock(prisma, {
      doctorId,
      blockId: params.id,
      ...payload,
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload inválido', details: error.issues }, { status: 400 })
    }
    if (error instanceof AvailabilityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
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

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const result = await deleteAvailabilityBlock(prisma, {
      doctorId,
      blockId: params.id,
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    if (error instanceof AvailabilityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
