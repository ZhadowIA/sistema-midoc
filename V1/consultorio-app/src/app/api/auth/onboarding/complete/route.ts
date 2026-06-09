import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDoctorSetupStatus } from "@/lib/setupStatus";
import { attachSessionCookie, buildSessionToken } from "@/lib/session";
import { captureError, logEvent } from "@/lib/observability";

export async function POST() {
  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (authUser.role !== "DOCTOR" && authUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    await prisma.doctorOnboarding.upsert({
      where: { doctorId: authUser.id },
      create: {
        doctorId: authUser.id,
        completed: true,
        completedAt: new Date(),
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
    });

    const setup = await getDoctorSetupStatus(authUser.id, authUser.role);
    const token = await buildSessionToken({
      sub: authUser.id,
      role: authUser.role,
      hasActiveSubscription: setup.hasActiveSubscription,
      onboardingCompleted: setup.onboardingCompleted,
    });

    const response = NextResponse.json({
      success: true,
      nextStep: setup.nextStep,
    });
    attachSessionCookie(response, token);
    logEvent("info", "auth.onboarding.completed", {
      userId: authUser.id,
      role: authUser.role,
    });
    return response;
  } catch (error: unknown) {
    captureError("auth.onboarding.complete.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
