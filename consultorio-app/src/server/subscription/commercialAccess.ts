import { AI_FEATURE_KEYS, coerceSubscriptionFeatures, type SubscriptionFeaturesRecord } from "@/lib/subscriptionFeatures";

export type CommercialAccessState =
  | "ACTIVE"
  | "ACTIVE_CANCEL_SCHEDULED"
  | "PAST_DUE_GRACE"
  | "PAST_DUE_SUSPENDED"
  | "PENDING"
  | "CANCELED"
  | "NO_SUBSCRIPTION";

export type CommercialAccessSnapshot = {
  commercialState: CommercialAccessState;
  hasActiveSubscription: boolean;
  appAccess: boolean;
  aiAccess: boolean;
  canManageBilling: boolean;
  gracePeriodEndsAt: string | null;
  message: string;
};

type SubscriptionLike = {
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  features?: unknown;
} | null;

function stripAiFeatures(features: SubscriptionFeaturesRecord): SubscriptionFeaturesRecord {
  const next = { ...features };
  for (const key of AI_FEATURE_KEYS) {
    delete next[key];
  }
  return next;
}

export function resolveCommercialAccess(
  subscription: SubscriptionLike,
  now = new Date(),
): CommercialAccessSnapshot {
  if (!subscription) {
    return {
      commercialState: "NO_SUBSCRIPTION",
      hasActiveSubscription: false,
      appAccess: false,
      aiAccess: false,
      canManageBilling: true,
      gracePeriodEndsAt: null,
      message: "No hay una suscripción comercial activa para esta cuenta.",
    };
  }

  const status = subscription.status.toUpperCase();
  const periodEnd = subscription.currentPeriodEnd?.toISOString() ?? null;
  const graceStillOpen = Boolean(subscription.currentPeriodEnd && subscription.currentPeriodEnd > now);

  if (status === "ACTIVE") {
    return {
      commercialState: subscription.cancelAtPeriodEnd ? "ACTIVE_CANCEL_SCHEDULED" : "ACTIVE",
      hasActiveSubscription: true,
      appAccess: true,
      aiAccess: true,
      canManageBilling: true,
      gracePeriodEndsAt: null,
      message: subscription.cancelAtPeriodEnd
        ? "La cuenta sigue activa hasta el cierre del periodo pagado, pero no renovará automáticamente."
        : "La cuenta está al corriente y renovará automáticamente.",
    };
  }

  if (status === "PAST_DUE") {
    if (graceStillOpen) {
      return {
        commercialState: "PAST_DUE_GRACE",
        hasActiveSubscription: true,
        appAccess: true,
        aiAccess: false,
        canManageBilling: true,
        gracePeriodEndsAt: periodEnd,
        message:
          "El cobro falló. Durante la gracia se mantiene el acceso operativo, pero las funciones de IA quedan suspendidas hasta regularizar el pago.",
      };
    }

    return {
      commercialState: "PAST_DUE_SUSPENDED",
      hasActiveSubscription: false,
      appAccess: false,
      aiAccess: false,
      canManageBilling: true,
      gracePeriodEndsAt: periodEnd,
      message:
        "La gracia terminó por falta de pago. La cuenta debe regularizar la suscripción para recuperar acceso al producto.",
    };
  }

  if (status === "CANCELED") {
    return {
      commercialState: "CANCELED",
      hasActiveSubscription: false,
      appAccess: false,
      aiAccess: false,
      canManageBilling: true,
      gracePeriodEndsAt: null,
      message: "La suscripción fue cancelada y la cuenta requiere una nueva compra para reactivarse.",
    };
  }

  if (status === "PENDING") {
    return {
      commercialState: "PENDING",
      hasActiveSubscription: false,
      appAccess: false,
      aiAccess: false,
      canManageBilling: true,
      gracePeriodEndsAt: null,
      message: "La suscripción existe, pero aún no hay confirmación de cobro.",
    };
  }

  return {
    commercialState: "NO_SUBSCRIPTION",
    hasActiveSubscription: false,
    appAccess: false,
    aiAccess: false,
    canManageBilling: true,
    gracePeriodEndsAt: periodEnd,
    message: `Estado comercial no reconocido: ${subscription.status}`,
  };
}

export function getEffectiveSubscriptionFeatures(
  featuresInput: unknown,
  commercialAccess: CommercialAccessSnapshot,
): SubscriptionFeaturesRecord {
  const features = coerceSubscriptionFeatures(featuresInput);

  if (!commercialAccess.appAccess) return {};
  if (commercialAccess.aiAccess) return features;

  return stripAiFeatures(features);
}
