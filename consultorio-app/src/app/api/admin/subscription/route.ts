import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { captureError, logEvent } from "@/lib/observability";
import { getClinicSeatSummary } from "@/lib/clinicSeats";

type SubscriptionScope = {
  mode: "DOCTOR" | "CLINIC";
  clinicId: string | null;
  billingDoctorId: string;
};

async function resolveSubscriptionScope(userId: string): Promise<SubscriptionScope | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, clinicId: true },
  });
  if (!user) return null;

  if (user.clinicId && user.role === "CLINIC_ADMIN") {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, ownerId: true },
    });
    return {
      mode: "CLINIC",
      clinicId: clinic?.id ?? user.clinicId,
      billingDoctorId: clinic?.ownerId ?? user.id,
    };
  }

  return {
    mode: "DOCTOR",
    clinicId: user.clinicId ?? null,
    billingDoctorId: user.id,
  };
}

async function buildSeatSummary(scope: SubscriptionScope) {
  if (scope.mode !== "CLINIC" || !scope.clinicId) return null;
  return getClinicSeatSummary(scope.clinicId);
}

export async function GET() {
  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (authUser.role !== "DOCTOR" && authUser.role !== "ADMIN" && authUser.role !== "CLINIC_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const scope = await resolveSubscriptionScope(authUser.id);
    if (!scope) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const subscription = await prisma.doctorSubscription.findUnique({
      where: { doctorId: scope.billingDoctorId },
    });
    const seats = await buildSeatSummary(scope);

    return NextResponse.json({ subscription, scope, seats });
  } catch (error: unknown) {
    captureError("billing.subscription.get.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (authUser.role !== "DOCTOR" && authUser.role !== "ADMIN" && authUser.role !== "CLINIC_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const scope = await resolveSubscriptionScope(authUser.id);
    if (!scope) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const cancelAtPeriodEnd = body.cancelAtPeriodEnd === true;

    const subscription = await prisma.doctorSubscription.findUnique({
      where: { doctorId: scope.billingDoctorId },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
    }

    const updated = await prisma.doctorSubscription.update({
      where: { doctorId: scope.billingDoctorId },
      data: {
        cancelAtPeriodEnd,
        canceledAt: cancelAtPeriodEnd ? new Date() : null,
      },
    });

    logEvent("info", "billing.subscription.cancel_at_period_end.updated", {
      userId: authUser.id,
      billingDoctorId: scope.billingDoctorId,
      mode: scope.mode,
      cancelAtPeriodEnd,
    });

    return NextResponse.json({ success: true, subscription: updated });
  } catch (error: unknown) {
    captureError("billing.subscription.patch.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
