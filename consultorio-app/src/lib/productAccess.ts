import prisma from "@/lib/prisma";
import {
  coerceFeaturesForProductAccess,
  getModuleAccessFromFeatures,
} from "@/lib/productAccessFeatures";
import { SUBSCRIPTION_FEATURES } from "@/lib/subscriptionFeatures";
import { getEffectiveSubscriptionFeatures, resolveCommercialAccess } from "@/server/subscription/commercialAccess";

export const PRODUCT_MODULES = {
  AGENDA: "AGENDA",
  CLINICAL_RECORDS: "CLINICAL_RECORDS",
} as const;

export type ProductModule = (typeof PRODUCT_MODULES)[keyof typeof PRODUCT_MODULES];

export const PRODUCT_PLANS = {
  AGENDA: "AGENDA",
  CLINICAL_RECORDS: "CLINICAL_RECORDS",
  COMBINED: "COMBINED",
} as const;

export type ProductPlan = (typeof PRODUCT_PLANS)[keyof typeof PRODUCT_PLANS];

export type ProductAccess = {
  plan: ProductPlan;
  enabledModules: ProductModule[];
  features: Record<string, unknown>;
};

function normalizePlanName(planName: string | null | undefined): ProductPlan {
  if (!planName) return PRODUCT_PLANS.COMBINED;

  const normalized = planName.trim().toLowerCase();
  if (!normalized) return PRODUCT_PLANS.COMBINED;

  if (
    normalized.includes("combinado") ||
    normalized.includes("combo") ||
    normalized.includes("integral") ||
    normalized.includes("full")
  ) {
    return PRODUCT_PLANS.COMBINED;
  }

  if (
    normalized.includes("agenda") ||
    normalized.includes("citas") ||
    normalized.includes("booking")
  ) {
    return PRODUCT_PLANS.AGENDA;
  }

  if (
    normalized.includes("expediente") ||
    normalized.includes("clinico") ||
    normalized.includes("clinical")
  ) {
    return PRODUCT_PLANS.CLINICAL_RECORDS;
  }

  return PRODUCT_PLANS.COMBINED;
}

export function getPlanModules(plan: ProductPlan): ProductModule[] {
  if (plan === PRODUCT_PLANS.AGENDA) {
    return [PRODUCT_MODULES.AGENDA];
  }
  if (plan === PRODUCT_PLANS.CLINICAL_RECORDS) {
    return [PRODUCT_MODULES.CLINICAL_RECORDS];
  }
  return [PRODUCT_MODULES.AGENDA, PRODUCT_MODULES.CLINICAL_RECORDS];
}

export function buildProductAccessFromFeatures(
  featuresInput: unknown,
  fallbackPlan: ProductPlan = PRODUCT_PLANS.COMBINED
): ProductAccess {
  const features = coerceFeaturesForProductAccess(featuresInput)
  const { agendaEnabled, clinicalEnabled } = getModuleAccessFromFeatures(features)

  if (agendaEnabled || clinicalEnabled) {
    return {
      plan:
        agendaEnabled && clinicalEnabled
          ? PRODUCT_PLANS.COMBINED
          : agendaEnabled
            ? PRODUCT_PLANS.AGENDA
            : PRODUCT_PLANS.CLINICAL_RECORDS,
      enabledModules: [
        ...(agendaEnabled ? [PRODUCT_MODULES.AGENDA] : []),
        ...(clinicalEnabled ? [PRODUCT_MODULES.CLINICAL_RECORDS] : []),
      ],
      features,
    }
  }

  return {
    plan: fallbackPlan,
    enabledModules: getPlanModules(fallbackPlan),
    features,
  }
}

export function moduleFromPath(pathname: string): ProductModule | null {
  if (
    pathname.startsWith("/medico/agenda") ||
    pathname.startsWith("/medico/dashboard") ||
    pathname.startsWith("/medico/contabilidad")
  ) {
    return PRODUCT_MODULES.AGENDA;
  }

  if (
    pathname.startsWith("/medico/pacientes") ||
    pathname.startsWith("/medico/citas") ||
    pathname.startsWith("/medico/cuestionarios")
  ) {
    return PRODUCT_MODULES.CLINICAL_RECORDS;
  }

  return null;
}

export function getDefaultLandingPath(access: ProductAccess): string {
  if (access.enabledModules.includes(PRODUCT_MODULES.AGENDA)) {
    return "/medico/agenda";
  }
  if (access.enabledModules.includes(PRODUCT_MODULES.CLINICAL_RECORDS)) {
    return "/medico/pacientes";
  }
  return "/medico/dashboard";
}

export function hasModuleAccess(access: ProductAccess, module: ProductModule): boolean {
  return access.enabledModules.includes(module);
}

export async function getDoctorProductAccess(doctorId: string, role: string): Promise<ProductAccess> {
  if (role === "ADMIN" || role === "CLINIC_ADMIN") {
    return {
      plan: PRODUCT_PLANS.COMBINED,
      enabledModules: getPlanModules(PRODUCT_PLANS.COMBINED),
      features: {
        [SUBSCRIPTION_FEATURES.AGENDA_ENABLED]: true,
        [SUBSCRIPTION_FEATURES.AGENDA_REMINDERS_WHATSAPP]: true,
        [SUBSCRIPTION_FEATURES.AGENDA_WAITLIST]: true,
        [SUBSCRIPTION_FEATURES.CLINICAL_ENABLED]: true,
        [SUBSCRIPTION_FEATURES.CLINICAL_HISTORY]: true,
        [SUBSCRIPTION_FEATURES.CLINICAL_NOTES]: true,
        [SUBSCRIPTION_FEATURES.CLINICAL_PRESCRIPTIONS]: true,
        [SUBSCRIPTION_FEATURES.CLINICAL_SIGNOFF]: true,
        [SUBSCRIPTION_FEATURES.CLINICAL_ENCOUNTERS_STANDALONE]: true,
        [SUBSCRIPTION_FEATURES.AI_ENABLED]: true,
        [SUBSCRIPTION_FEATURES.AI_DICTATION]: true,
        [SUBSCRIPTION_FEATURES.AI_INSIGHTS]: true,
        [SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_TEXT]: true,
        [SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_AUDIO]: true,
        [SUBSCRIPTION_FEATURES.AI_CREDITS_ENABLED]: true,
        [SUBSCRIPTION_FEATURES.SPECIALTY_CORE_ENABLED]: true,
        [SUBSCRIPTION_FEATURES.AI_SPECIALTY_ENABLED]: true,
      },
    };
  }

  const subscription = await prisma.doctorSubscription.findUnique({
    where: { doctorId },
    select: { planName: true, features: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });

  const fallbackPlan = normalizePlanName(subscription?.planName)
  const effectiveFeatures = subscription
    ? getEffectiveSubscriptionFeatures(
        subscription.features,
        resolveCommercialAccess({
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          features: subscription.features,
        }),
      )
    : undefined
  const accessFromFeatures = buildProductAccessFromFeatures(effectiveFeatures, fallbackPlan)

  if (Object.keys(accessFromFeatures.features).length > 0) {
    return accessFromFeatures
  }

  return {
    ...accessFromFeatures,
    plan: fallbackPlan,
    enabledModules: getPlanModules(fallbackPlan),
  }
}
