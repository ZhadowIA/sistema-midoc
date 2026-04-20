import prisma from "@/lib/prisma";

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
    };
  }

  const subscription = await prisma.doctorSubscription.findUnique({
    where: { doctorId },
    select: { planName: true },
  });

  const plan = normalizePlanName(subscription?.planName);
  return {
    plan,
    enabledModules: getPlanModules(plan),
  };
}
