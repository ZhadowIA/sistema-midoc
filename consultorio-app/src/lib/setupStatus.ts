import prisma from "@/lib/prisma";
import { resolveCommercialAccess } from "@/server/subscription/commercialAccess";

export type SetupStep = "DASHBOARD" | "SUBSCRIPTION" | "ONBOARDING";

export type DoctorSetupStatus = {
  hasActiveSubscription: boolean;
  onboardingCompleted: boolean;
  nextStep: SetupStep;
};

export async function getDoctorSetupStatus(userId: string, role: string): Promise<DoctorSetupStatus> {
  if (role === "ADMIN" || role === "CLINIC_ADMIN") {
    return {
      hasActiveSubscription: true,
      onboardingCompleted: true,
      nextStep: "DASHBOARD",
    };
  }

  const now = new Date();

  const [subscription, onboarding] = await Promise.all([
    prisma.doctorSubscription.findUnique({
      where: { doctorId: userId },
      select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
    prisma.doctorOnboarding.findUnique({
      where: { doctorId: userId },
      select: { completed: true },
    }),
  ]);

  // Backward compatibility: legacy doctors without subscription record are treated as active.
  const commercialAccess = !subscription
    ? {
        hasActiveSubscription: true,
      }
    : resolveCommercialAccess(
        {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        },
        now,
      );
  const hasActiveSubscription = !subscription ? true : commercialAccess.hasActiveSubscription;

  // Backward compatibility: legacy doctors without onboarding record are treated as completed.
  const onboardingCompleted = onboarding ? onboarding.completed : true;

  let nextStep: SetupStep = "DASHBOARD";
  if (!hasActiveSubscription) {
    nextStep = "SUBSCRIPTION";
  } else if (!onboardingCompleted) {
    nextStep = "ONBOARDING";
  }

  return {
    hasActiveSubscription,
    onboardingCompleted,
    nextStep,
  };
}
