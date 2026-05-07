import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { captureError } from '@/lib/observability'
import { WaitlistService } from '@/services/WaitlistService'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'

export async function POST(request: Request) {
  try {
    const env = getServerEnv()
    const expectedSecret = env.NOTIFICATION_CRON_SECRET
    if (!expectedSecret) {
      return NextResponse.json(
        { error: 'NOTIFICATION_CRON_SECRET no está configurado' },
        { status: 503 }
      )
    }

    const providedSecret = request.headers.get('x-notification-secret')
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const now = new Date()
    const overdueAppointments = await prisma.appointment.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        paymentStatus: 'PAYMENT_PENDING',
        depositDueAt: { lte: now },
      },
      select: {
        id: true,
        doctorId: true,
        clinicId: true,
        patientId: true,
        startTime: true,
        endTime: true,
      },
      take: 100,
      orderBy: { depositDueAt: 'asc' },
    })

    let expired = 0

    for (const appointment of overdueAppointments) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'PAYMENT_FAILED',
        },
      })

      await AppointmentAuditService.safeLog({
        doctorId: appointment.doctorId,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        actorType: 'SYSTEM',
        actorUserId: null,
        source: 'SYSTEM',
        ipAddress: null,
        userAgent: null,
        action: 'APPOINTMENT_CANCELLED',
        fromStatus: 'PENDING',
        toStatus: 'CANCELLED',
        metadata: { reason: 'DEPOSIT_EXPIRED', paymentStatus: 'PAYMENT_FAILED' },
      })

      await WaitlistService.processVacancy({
        doctorId: appointment.doctorId,
        clinicId: appointment.clinicId,
        sourceAppointmentId: appointment.id,
        slotStartTime: appointment.startTime,
        slotEndTime: appointment.endTime,
        actorType: 'SYSTEM',
        actorUserId: null,
        source: 'SYSTEM',
        trigger: 'CANCELLATION',
      })

      expired += 1
    }

    return NextResponse.json({
      success: true,
      inspected: overdueAppointments.length,
      expired,
      processedAt: now.toISOString(),
    })
  } catch (error: unknown) {
    captureError('payments.process.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
