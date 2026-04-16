import { NextResponse } from 'next/server'
import { addMinutes, format } from 'date-fns'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { AvailabilityService } from '@/services/AvailabilityService'

const payloadSchema = z.object({
  action: z.enum(['CONFIRM', 'CANCEL', 'RESCHEDULE']),
  newStartTime: z.string().optional(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const parsed = payloadSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        patient: {
          userId: authUser.id,
        },
      },
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const now = new Date()
    const isPastAppointment = appointment.endTime <= now
    const canManage =
      appointment.status === 'PENDING' || appointment.status === 'CONFIRMED' || appointment.status === 'RESCHEDULED'

    if (!canManage) {
      return NextResponse.json(
        { error: 'Esta cita ya no permite cambios desde el portal de paciente.' },
        { status: 409 }
      )
    }

    if (parsed.data.action === 'CONFIRM') {
      if (isPastAppointment) {
        return NextResponse.json(
          { error: 'No puedes confirmar una cita que ya finalizó.' },
          { status: 409 }
        )
      }

      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CONFIRMED' },
        select: { id: true, status: true, startTime: true, endTime: true },
      })
      return NextResponse.json({ success: true, appointment: updated })
    }

    if (parsed.data.action === 'CANCEL') {
      if (appointment.startTime <= now) {
        return NextResponse.json(
          { error: 'Solo puedes cancelar citas futuras.' },
          { status: 409 }
        )
      }

      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CANCELLED' },
        select: { id: true, status: true, startTime: true, endTime: true },
      })
      return NextResponse.json({ success: true, appointment: updated })
    }

    const newStartTimeRaw = parsed.data.newStartTime
    if (!newStartTimeRaw) {
      return NextResponse.json({ error: 'Falta newStartTime para reagendar.' }, { status: 400 })
    }

    const newStartTime = new Date(newStartTimeRaw)
    if (Number.isNaN(newStartTime.getTime())) {
      return NextResponse.json({ error: 'Fecha inválida para reagendar.' }, { status: 400 })
    }
    if (newStartTime <= now) {
      return NextResponse.json({ error: 'Solo puedes reagendar a horarios futuros.' }, { status: 409 })
    }

    const dateKey = format(newStartTime, 'yyyy-MM-dd')
    const typeKey = appointment.appointmentType.toLowerCase() as 'normal' | 'extended'
    const availability = await AvailabilityService.getAvailability(appointment.doctorId, dateKey, typeKey)
    const isSlotAvailable = availability.slots.some((slot) => slot.start === newStartTime.toISOString())

    if (!isSlotAvailable) {
      return NextResponse.json(
        { error: 'Ese horario ya no está disponible para reagendar.' },
        { status: 409 }
      )
    }

    const newEndTime = addMinutes(newStartTime, appointment.durationMin)
    const localDate = new Date(newStartTime)
    localDate.setHours(0, 0, 0, 0)

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        date: localDate,
        startTime: newStartTime,
        endTime: newEndTime,
        status: 'CONFIRMED',
      },
      select: { id: true, status: true, startTime: true, endTime: true },
    })

    return NextResponse.json({ success: true, appointment: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
