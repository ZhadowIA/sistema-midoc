import prisma from "@/lib/prisma";

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
      select: { status: true, currentPeriodEnd: true },
    }),
    prisma.doctorOnboarding.findUnique({
      where: { doctorId: userId },
      select: { completed: true },
    }),
  ]);

  // Backward compatibility: legacy doctors without subscription record are treated as active.
  const hasActiveSubscription = !subscription
    ? true
    : subscription.status === "ACTIVE" && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);

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
