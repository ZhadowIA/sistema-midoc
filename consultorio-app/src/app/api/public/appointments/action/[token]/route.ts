import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { verifyAppointmentActionToken } from '@/lib/appointmentActionToken'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { AppointmentStatus } from '@prisma/client'
import { format } from 'date-fns'
import { checkRateLimit } from '@/lib/rateLimitCore'
import { NotificationService } from '@/services/NotificationService'

const actionSchema = z.object({
  action: z.enum(['CONFIRM', 'CANCEL']),
})

export async function GET(_: Request, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params
  try {
    const { appointmentId } = await verifyAppointmentActionToken(token)
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        startTime: true,
        status: true,
        doctor: { select: { name: true } },
        patient: { select: { firstName: true, lastNamePaternal: true } },
      },
    })
    if (!appointment) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })

    return NextResponse.json({
      appointmentId: appointment.id,
      startTime: appointment.startTime.toISOString(),
      status: appointment.status,
      doctorName: appointment.doctor.name,
      patientName: `${appointment.patient.firstName} ${appointment.patient.lastNamePaternal}`.trim(),
    })
  } catch {
    return NextResponse.json({ error: 'Enlace inválido o expirado' }, { status: 401 })
  }
}

export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const rl = await checkRateLimit(request, { key: 'cita-action', limit: 10, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec) },
    })
  }

  const { token } = await props.params
  try {
    const { appointmentId } = await verifyAppointmentActionToken(token)

    const body = await request.json().catch(() => null)
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    const { action } = parsed.data

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        doctorId: true,
        patientId: true,
        status: true,
        startTime: true,
        doctor: { select: { email: true, name: true } },
        patient: { select: { firstName: true, lastNamePaternal: true } },
      },
    })
    if (!appointment) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })

    if (action === 'CONFIRM') {
      if (appointment.status === AppointmentStatus.CONFIRMED) {
        return NextResponse.json({ success: true, action, alreadyDone: true })
      }
      if (appointment.status !== AppointmentStatus.PENDING) {
        return NextResponse.json(
          { error: 'La cita no puede confirmarse en su estado actual' },
          { status: 409 }
        )
      }

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CONFIRMED },
      })

      await AppointmentAuditService.safeLog({
        doctorId: appointment.doctorId,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        actorType: 'PATIENT',
        source: 'PATIENT_PORTAL',
        action: 'APPOINTMENT_STATUS_CHANGED',
        fromStatus: AppointmentStatus.PENDING,
        toStatus: AppointmentStatus.CONFIRMED,
        metadata: { channel: 'NOTIFICATION_LINK', trigger: 'PATIENT_CONFIRM' },
      })
    }

    if (action === 'CANCEL') {
      if (appointment.status === AppointmentStatus.CANCELLED) {
        return NextResponse.json({ success: true, action, alreadyDone: true })
      }
      if (
        appointment.status !== AppointmentStatus.PENDING &&
        appointment.status !== AppointmentStatus.CONFIRMED
      ) {
        return NextResponse.json(
          { error: 'La cita no puede cancelarse en su estado actual' },
          { status: 409 }
        )
      }

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CANCELLED },
      })

      await AppointmentAuditService.safeLog({
        doctorId: appointment.doctorId,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        actorType: 'PATIENT',
        source: 'PATIENT_PORTAL',
        action: 'APPOINTMENT_STATUS_CHANGED',
        fromStatus: appointment.status,
        toStatus: AppointmentStatus.CANCELLED,
        metadata: { channel: 'NOTIFICATION_LINK', trigger: 'PATIENT_CANCEL' },
      })

      const doctorEmail = appointment.doctor.email
      if (doctorEmail) {
        const patientName = `${appointment.patient.firstName} ${appointment.patient.lastNamePaternal}`.trim()
        const dateStr = format(appointment.startTime, 'dd/MM/yyyy HH:mm')
        await NotificationService.enqueueDoctorAlert(
          appointment.id,
          doctorEmail,
          `El paciente ${patientName} canceló su cita del ${dateStr} a través del enlace de notificación. El slot ha quedado disponible.`,
        )
      }
    }

    return NextResponse.json({ success: true, action })
  } catch {
    return NextResponse.json({ error: 'Enlace inválido o expirado' }, { status: 401 })
  }
}
