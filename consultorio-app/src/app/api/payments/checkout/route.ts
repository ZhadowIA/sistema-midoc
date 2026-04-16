import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { logEvent, captureError } from "@/lib/observability";

export async function POST() {
  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (authUser.role !== "DOCTOR" && authUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const env = getServerEnv();
    const checkoutReference = `chk_${authUser.id.slice(0, 8)}_${Date.now()}`;

    // Placeholder hasta integrar proveedor real.
    const checkoutUrl = `/medico/suscripcion?checkout=${checkoutReference}&provider=${env.PAYMENTS_PROVIDER.toLowerCase()}`;

    logEvent("info", "billing.checkout.created", {
      userId: authUser.id,
      provider: env.PAYMENTS_PROVIDER,
      checkoutReference,
    });

    return NextResponse.json({
      success: true,
      provider: env.PAYMENTS_PROVIDER,
      checkoutReference,
      checkoutUrl,
    });
  } catch (error: unknown) {
    captureError("billing.checkout.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
