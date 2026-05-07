import { getDoctorSetupStatus } from "@/lib/setupStatus";
import { getDoctorProductAccess } from "@/lib/productAccess";
import type { SessionClaims } from "@/lib/session";

type SessionUser = {
  id: string;
  role: string;
  bossId?: string | null;
};

export async function buildMedicalSessionClaims(
  user: SessionUser,
  options?: { twoFactorVerified?: boolean; twoFactorSetupRequired?: boolean },
): Promise<SessionClaims> {
  if (user.role !== "DOCTOR" && user.role !== "ADMIN" && user.role !== "CLINIC_ADMIN" && user.role !== "SECRETARY") {
    return {
      sub: user.id,
      role: user.role,
      bossId: user.bossId ?? null,
      twoFactorVerified: options?.twoFactorVerified,
      twoFactorSetupRequired: options?.twoFactorSetupRequired,
    };
  }

  const setup = await getDoctorSetupStatus(user.id, user.role);
  const doctorIdForPlan = user.role === "SECRETARY" ? user.bossId : user.id;
  const productAccess = doctorIdForPlan
    ? await getDoctorProductAccess(doctorIdForPlan, user.role)
    : {
        plan: "COMBINED" as const,
        enabledModules: ["AGENDA", "CLINICAL_RECORDS"] as const,
        features: {
          "agenda.enabled": true,
          "clinical.enabled": true,
        },
      };

  return {
    sub: user.id,
    role: user.role,
    bossId: user.bossId ?? null,
    hasActiveSubscription: setup.hasActiveSubscription,
    onboardingCompleted: setup.onboardingCompleted,
    productPlan: productAccess.plan,
    enabledModules: [...productAccess.enabledModules],
    features: productAccess.features,
    twoFactorVerified: options?.twoFactorVerified,
    twoFactorSetupRequired: options?.twoFactorSetupRequired,
  };
}
