import { format } from 'date-fns'
import type { AppointmentPaymentStatus, AppointmentStatus, PrismaClient } from '@prisma/client'
import { getWhatsAppProviderSendUrl } from '@/lib/whatsappProvider'
import { formatPatientName } from '@/lib/patientName'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { WaitlistService } from '@/services/WaitlistService'
import { AgendaAppointmentInputError } from '@/server/agenda/appointments/errors'
import { resolveDepositCancellationOutcome, type DepositCancellationOutcome, type DepositRefundMode } from '@/lib/depositPolicy'

const ALLOWED_STATUS = new Set<AppointmentStatus>(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'])

type ExistingAppointment = {
  id: string
  doctorId: string
  patientId: string
  status: AppointmentStatus
  startTime: Date
  endTime: Date
}

type UpdateAppointmentStatusInput = {
  prisma: PrismaClient
  appointmentId: string
  doctorId: string
  existing: ExistingAppointment
  actorUserId: string
  actorRole: string
  ipAddress: string | null
  userAgent: string | null
  status: unknown
  notes: unknown
}

export async function updateAppointmentStatus(input: UpdateAppointmentStatusInput) {
  let requestedStatus: AppointmentStatus | undefined
  if (typeof input.status === 'string') {
    if (!ALLOWED_STATUS.has(input.status as AppointmentStatus)) {
      throw new AgendaAppointmentInputError('Estado inválido. Usa acción RESCHEDULE para reagendar.')
    }
    requestedStatus = input.status as AppointmentStatus
  }

  const updated = await input.prisma.appointment.update({
    where: { id: input.appointmentId },
    data: {
      status: requestedStatus ?? input.existing.status,
      notes: input.notes !== undefined ? (input.notes as string | null) : undefined,
    },
  })

  if (input.existing.status !== updated.status) {
    await AppointmentAuditService.safeLog({
      doctorId: input.doctorId,
      appointmentId: updated.id,
      patientId: updated.patientId,
      actorType: 'DOCTOR',
      actorUserId: input.actorUserId,
      source: 'ADMIN_PANEL',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      action: updated.status === 'CANCELLED' ? 'APPOINTMENT_CANCELLED' : 'APPOINTMENT_STATUS_CHANGED',
      fromStatus: input.existing.status,
      toStatus: updated.status,
      metadata: {
        actorRole: input.actorRole,
        delegatedDoctorId: input.doctorId !== input.actorUserId ? input.doctorId : null,
      },
    })
  }

  const config = await input.prisma.doctorConfig.findUnique({ where: { doctorId: input.doctorId } })
  if (config?.whatsappConnected && input.existing.status !== updated.status && updated.status === 'CANCELLED') {
    const patient = await input.prisma.patient.findUnique({ where: { id: updated.patientId } })
    if (patient) {
      const msg = `Hola *${formatPatientName(patient)}*, lamentamos informarte que tu cita programada para el ${format(input.existing.startTime, 'dd/MM/yyyy HH:mm')} ha sido *CANCELADA* por el doctor. Por favor contáctanos para más información.`
      try {
        await fetch(getWhatsAppProviderSendUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doctorId: input.doctorId, to: patient.phone, message: msg }),
        })
      } catch (err) {
        console.error('Error WA Admin:', err)
      }
    }
  }

  let billingOutcome: DepositCancellationOutcome | null = null

  if (input.existing.status !== 'CANCELLED' && updated.status === 'CANCELLED') {
    // Calcular outcome de reembolso si había anticipo pagado
    if (updated.paymentStatus === 'DEPOSIT_PAID') {
      const rawSnapshot = updated.cancellationPolicySnapshot as {
        windowHours?: number | null
        refundMode?: string | null
        partialRefundPct?: number | null
      } | null
      const snapshot = rawSnapshot
        ? {
            windowHours: rawSnapshot.windowHours,
            refundMode: rawSnapshot.refundMode as DepositRefundMode | null | undefined,
            partialRefundPct: rawSnapshot.partialRefundPct,
          }
        : null
      billingOutcome = resolveDepositCancellationOutcome({
        appointmentStart: input.existing.startTime,
        cancelledAt: new Date(),
        depositPaidAmount: updated.depositPaidAmount ? Number(updated.depositPaidAmount) : 0,
        policySnapshot: snapshot,
      })

      // Actualizar paymentStatus según el outcome
      const nextPaymentStatus: AppointmentPaymentStatus =
        billingOutcome.refundableAmount > 0 ? 'REFUND_PENDING' :
        billingOutcome.creditAmount > 0     ? 'CREDIT_ISSUED' :
                                              'DEPOSIT_FORFEITED'

      await input.prisma.appointment.update({
        where: { id: updated.id },
        data: { paymentStatus: nextPaymentStatus },
      })
    }

    await WaitlistService.processVacancy({
      doctorId: input.doctorId,
      clinicId: updated.clinicId,
      sourceAppointmentId: updated.id,
      slotStartTime: input.existing.startTime,
      slotEndTime: input.existing.endTime,
      actorType: 'DOCTOR',
      actorUserId: input.actorUserId,
      source: 'ADMIN_PANEL',
      trigger: 'CANCELLATION',
    })
  }

  const hydrated = await input.prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { patient: true, questionnaire: true, doctor: true },
  })

  if (!hydrated) {
    throw new Error('No fue posible obtener la cita actualizada.')
  }

  return { ...hydrated, billingOutcome }
}

