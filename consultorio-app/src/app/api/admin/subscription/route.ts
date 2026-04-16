import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedDoctorId } from "@/lib/auth";
import { captureError, logEvent } from "@/lib/observability";

export async function GET() {
  try {
    const doctorId = await getAuthenticatedDoctorId();
    if (!doctorId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const subscription = await prisma.doctorSubscription.findUnique({
      where: { doctorId },
    });

    return NextResponse.json({ subscription });
  } catch (error: unknown) {
    captureError("billing.subscription.get.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId();
    if (!doctorId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const cancelAtPeriodEnd = body.cancelAtPeriodEnd === true;

    const subscription = await prisma.doctorSubscription.findUnique({
      where: { doctorId },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
    }

    const updated = await prisma.doctorSubscription.update({
      where: { doctorId },
      data: {
        cancelAtPeriodEnd,
        canceledAt: cancelAtPeriodEnd ? new Date() : null,
      },
    });

    logEvent("info", "billing.subscription.cancel_at_period_end.updated", {
      userId: doctorId,
      cancelAtPeriodEnd,
    });

    return NextResponse.json({ success: true, subscription: updated });
  } catch (error: unknown) {
    captureError("billing.subscription.patch.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
