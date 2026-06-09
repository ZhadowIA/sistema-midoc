import prisma from '@/lib/prisma'
import { getClinicSeatSummary } from '@/lib/clinicSeats'
import type { BillingStatus, SubscriptionScope } from '@/server/subscription/types'
import { resolveCommercialAccess } from '@/server/subscription/commercialAccess'

export function buildBillingStatus(subscription: {
  status: string
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
} | null): BillingStatus {
  const access = resolveCommercialAccess(subscription)

  if (!subscription) {
    return {
      label: 'Sin suscripción',
      severity: 'neutral',
      message: access.message,
      gracePeriodEndsAt: access.gracePeriodEndsAt,
      commercialState: access.commercialState,
      appAccess: access.appAccess,
      aiAccess: access.aiAccess,
      actionLabel: 'Elegir plan',
      actionHint: 'Activa una suscripción para desbloquear agenda, expediente e IA.',
    }
  }

  const status = subscription.status.toUpperCase()

  if (status === 'ACTIVE') {
    return {
      label: subscription.cancelAtPeriodEnd ? 'Activa, no renovará' : 'Activa',
      severity: subscription.cancelAtPeriodEnd ? 'warning' : 'success',
      message: access.message,
      gracePeriodEndsAt: access.gracePeriodEndsAt,
      commercialState: access.commercialState,
      appAccess: access.appAccess,
      aiAccess: access.aiAccess,
      actionLabel: subscription.cancelAtPeriodEnd ? 'Reactivar renovación' : null,
      actionHint: subscription.cancelAtPeriodEnd
        ? 'Si quieres evitar la baja al cierre del periodo, reactiva la renovación automática.'
        : null,
    }
  }

  if (status === 'PAST_DUE') {
    return {
      label: access.appAccess ? 'Pago pendiente en gracia' : 'Suspendida por impago',
      severity: 'warning',
      message: access.message,
      gracePeriodEndsAt: access.gracePeriodEndsAt,
      commercialState: access.commercialState,
      appAccess: access.appAccess,
      aiAccess: access.aiAccess,
      actionLabel: 'Regularizar pago',
      actionHint: access.appAccess
        ? 'La agenda y el expediente siguen activos temporalmente, pero la IA está bloqueada hasta corregir el cobro.'
        : 'La cuenta ya no tiene acceso al producto. Regulariza el pago para reactivar el servicio.',
    }
  }

  if (status === 'CANCELED') {
    return {
      label: 'Cancelada',
      severity: 'danger',
      message: access.message,
      gracePeriodEndsAt: access.gracePeriodEndsAt,
      commercialState: access.commercialState,
      appAccess: access.appAccess,
      aiAccess: access.aiAccess,
      actionLabel: 'Comprar nuevamente',
      actionHint: 'Necesitas una nueva suscripción para recuperar acceso operativo.',
    }
  }

  if (status === 'PENDING') {
    return {
      label: 'Pendiente',
      severity: 'neutral',
      message: access.message,
      gracePeriodEndsAt: access.gracePeriodEndsAt,
      commercialState: access.commercialState,
      appAccess: access.appAccess,
      aiAccess: access.aiAccess,
      actionLabel: 'Completar checkout',
      actionHint: 'Termina el flujo de pago para activar la cuenta.',
    }
  }

  return {
    label: subscription.status,
    severity: 'neutral',
    message: access.message,
    gracePeriodEndsAt: access.gracePeriodEndsAt,
    commercialState: access.commercialState,
    appAccess: access.appAccess,
    aiAccess: access.aiAccess,
    actionLabel: 'Revisar cuenta',
    actionHint: 'Verifica el estado reportado por el proveedor de pagos.',
  }
}

export function readPayloadData(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const data = (payload as Record<string, unknown>).data
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export async function resolveSubscriptionScope(userId: string): Promise<SubscriptionScope | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, clinicId: true },
  })
  if (!user) return null

  if (user.clinicId && user.role === 'CLINIC_ADMIN') {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, ownerId: true },
    })
    return {
      mode: 'CLINIC',
      clinicId: clinic?.id ?? user.clinicId,
      billingDoctorId: clinic?.ownerId ?? user.id,
    }
  }

  return {
    mode: 'DOCTOR',
    clinicId: user.clinicId ?? null,
    billingDoctorId: user.id,
  }
}

export async function buildSeatSummary(scope: SubscriptionScope) {
  if (scope.mode !== 'CLINIC' || !scope.clinicId) return null
  return getClinicSeatSummary(scope.clinicId)
}
