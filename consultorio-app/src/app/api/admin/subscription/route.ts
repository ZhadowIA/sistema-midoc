import { NextResponse } from "next/server";
import { requireStaffApiAccess } from "@/lib/medicalApi";
import { captureError, logEvent } from "@/lib/observability";
import { can, PERMISSIONS } from "@/lib/permissions";
import { getSubscriptionOverview, updateCancelAtPeriodEnd } from "@/server/subscription";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";

export async function GET() {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ["DOCTOR", "ADMIN", "CLINIC_ADMIN"],
    });
    if (access.response) return access.response;
    const authUser = access.user;

    if (!can(authUser, PERMISSIONS.BILLING_READ)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const overview = await getSubscriptionOverview(authUser.id);
    if (!overview) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    return NextResponse.json(overview);
  } catch (error: unknown) {
    captureError("billing.subscription.get.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ["DOCTOR", "ADMIN", "CLINIC_ADMIN"],
    });
    if (access.response) return access.response;
    const authUser = access.user;

    if (!can(authUser, PERMISSIONS.BILLING_MANAGE)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const cancelAtPeriodEnd = body.cancelAtPeriodEnd === true;

    const result = await updateCancelAtPeriodEnd(authUser.id, cancelAtPeriodEnd, {
      actorUserId: authUser.id,
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
    });
    if (!result) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!result.subscription) {
      return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
    }

    logEvent("info", "billing.subscription.cancel_at_period_end.updated", {
      userId: authUser.id,
      billingDoctorId: result.scope.billingDoctorId,
      mode: result.scope.mode,
      cancelAtPeriodEnd,
    });

    return NextResponse.json({ success: true, subscription: result.subscription });
  } catch (error: unknown) {
    captureError("billing.subscription.patch.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
