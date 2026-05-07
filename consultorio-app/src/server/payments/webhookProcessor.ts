import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveCommercialPlanFromSubscription } from "@/lib/subscriptionCatalog";
import { AppointmentAuditService } from "@/services/AppointmentAuditService";

type MinimalPayload = {
  data?: Record<string, unknown>;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isAppointmentDepositCheckout(eventType: string, payload: MinimalPayload): boolean {
  return eventType === "checkout.session.completed" && payload.data?.kind === "appointment_deposit";
}

async function resolveDoctorId(payload: MinimalPayload): Promise<string | null> {
  const directDoctorId = asString(payload.data?.doctorId);
  if (directDoctorId) return directDoctorId;

  const customerId = asString(payload.data?.customerId);
  const externalSubscriptionId = asString(payload.data?.subscriptionId);
  if (!customerId && !externalSubscriptionId) return null;

  const subscription = await prisma.doctorSubscription.findFirst({
    where: {
      OR: [
        ...(customerId ? [{ customerId }] : []),
        ...(externalSubscriptionId ? [{ externalSubscriptionId }] : []),
      ],
    },
    select: { doctorId: true },
  });
  return subscription?.doctorId ?? null;
}

async function processAppointmentDeposit(payload: MinimalPayload) {
  const appointmentId = asString(payload.data?.appointmentId);
  if (!appointmentId) throw new Error("Webhook de anticipo sin appointmentId");

  const amount = typeof payload.data?.amount === "number" ? payload.data.amount : null;
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      doctorId: true,
      patientId: true,
      status: true,
      paymentStatus: true,
      depositRequiredAmount: true,
    },
  });

  if (!appointment) throw new Error(`Cita no encontrada para anticipo: ${appointmentId}`);
  if (appointment.paymentStatus === "DEPOSIT_PAID") return { doctorId: appointment.doctorId, alreadyPaid: true };
  if (appointment.paymentStatus !== "PAYMENT_PENDING") throw new Error(`La cita ${appointmentId} no está pendiente de anticipo`);

  const requiredAmount = appointment.depositRequiredAmount ? Number(appointment.depositRequiredAmount) : null;
  if (!amount || !requiredAmount || amount < requiredAmount) throw new Error(`Monto de anticipo inválido para cita ${appointmentId}`);

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { paymentStatus: "DEPOSIT_PAID", depositPaidAmount: amount, depositPaidAt: new Date() },
  });

  await AppointmentAuditService.safeLog({
    doctorId: appointment.doctorId,
    appointmentId,
    patientId: appointment.patientId,
    actorType: "SYSTEM",
    actorUserId: null,
    source: "SYSTEM",
    action: "APPOINTMENT_STATUS_CHANGED",
    fromStatus: appointment.status,
    toStatus: appointment.status,
    metadata: {
      paymentStatusFrom: "PAYMENT_PENDING",
      paymentStatusTo: "DEPOSIT_PAID",
      depositPaidAmount: amount,
      stripeCheckoutSessionId: asString(payload.data?.checkoutSessionId),
      stripePaymentIntentId: asString(payload.data?.paymentIntentId),
    },
  });

  return { doctorId: appointment.doctorId, alreadyPaid: false };
}

export async function processWebhookBusinessEvent(input: {
  provider: "STRIPE";
  eventType: string;
  payload: MinimalPayload;
}): Promise<{ doctorId: string | null }> {
  const { provider, eventType, payload } = input;
  const isDeposit = isAppointmentDepositCheckout(eventType, payload);

  if (isDeposit) {
    const result = await processAppointmentDeposit(payload);
    return { doctorId: result.doctorId };
  }

  const doctorId = await resolveDoctorId(payload);
  if (!doctorId) return { doctorId: null };

  const existingSubscription = await prisma.doctorSubscription.findUnique({
    where: { doctorId },
    select: { planName: true, features: true },
  });
  const normalizedPlan = resolveCommercialPlanFromSubscription({
    planName: asString(payload.data?.planName) ?? existingSubscription?.planName,
    features: existingSubscription?.features,
  });

  if (
    eventType === "invoice.paid" ||
    eventType === "checkout.session.completed" ||
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated"
  ) {
    const start = asString(payload.data?.currentPeriodStart);
    const end = asString(payload.data?.currentPeriodEnd);
    await prisma.doctorSubscription.upsert({
      where: { doctorId },
      create: {
        doctorId,
        provider,
        status: "ACTIVE",
        planName: normalizedPlan.legacyPlanName,
        amount: typeof payload.data?.amount === "number" ? payload.data.amount : null,
        currency: asString(payload.data?.currency) || "MXN",
        customerId: asString(payload.data?.customerId),
        externalSubscriptionId: asString(payload.data?.subscriptionId),
        externalPriceId: asString(payload.data?.priceId),
        paymentMethodLast4: asString(payload.data?.paymentMethodLast4),
        currentPeriodStart: start ? new Date(start) : null,
        currentPeriodEnd: end ? new Date(end) : null,
        cancelAtPeriodEnd: payload.data?.cancelAtPeriodEnd === true,
        canceledAt: payload.data?.cancelAtPeriodEnd === true ? new Date() : null,
        lastPaymentAt: eventType === "invoice.paid" ? new Date() : null,
        features: normalizedPlan.features as Prisma.InputJsonValue,
      },
      update: {
        provider,
        status: "ACTIVE",
        planName: normalizedPlan.legacyPlanName,
        customerId: asString(payload.data?.customerId) || undefined,
        externalSubscriptionId: asString(payload.data?.subscriptionId) || undefined,
        externalPriceId: asString(payload.data?.priceId) || undefined,
        paymentMethodLast4: asString(payload.data?.paymentMethodLast4) || undefined,
        currentPeriodStart: start ? new Date(start) : undefined,
        currentPeriodEnd: end ? new Date(end) : undefined,
        cancelAtPeriodEnd: payload.data?.cancelAtPeriodEnd === true,
        canceledAt: payload.data?.cancelAtPeriodEnd === true ? new Date() : null,
        lastPaymentAt: eventType === "invoice.paid" ? new Date() : undefined,
        features: normalizedPlan.features as Prisma.InputJsonValue,
      },
    });
  } else if (eventType === "invoice.payment_failed") {
    await prisma.doctorSubscription.updateMany({
      where: { doctorId },
      data: { status: "PAST_DUE" },
    });
  } else if (eventType === "customer.subscription.deleted") {
    await prisma.doctorSubscription.updateMany({
      where: { doctorId },
      data: { status: "CANCELED", cancelAtPeriodEnd: false, canceledAt: new Date() },
    });
  }

  return { doctorId };
}

export type { MinimalPayload };
