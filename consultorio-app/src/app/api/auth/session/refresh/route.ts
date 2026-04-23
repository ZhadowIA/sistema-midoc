import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { attachSessionCookie, buildSessionToken } from "@/lib/session";
import { getDoctorSetupStatus } from "@/lib/setupStatus";
import { jsonNoStore, withNoStoreHeaders } from "@/lib/http";
import { getDoctorProductAccess } from "@/lib/productAccess";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return jsonNoStore({ error: "No autorizado" }, { status: 401 });
  }

  const doctorSetup =
    user.role === "DOCTOR" || user.role === "ADMIN"
      ? await getDoctorSetupStatus(user.id, user.role)
      : null;
  const productAccess =
    user.role === "DOCTOR" || user.role === "ADMIN" || user.role === "SECRETARY"
      ? await getDoctorProductAccess(user.role === "SECRETARY" ? user.bossId ?? user.id : user.id, user.role)
      : null;

  const token = await buildSessionToken({
    sub: user.id,
    role: user.role,
    bossId: user.bossId ?? null,
    hasActiveSubscription: doctorSetup?.hasActiveSubscription,
    onboardingCompleted: doctorSetup?.onboardingCompleted,
    productPlan: productAccess?.plan,
    enabledModules: productAccess ? [...productAccess.enabledModules] : undefined,
    features: productAccess?.features,
  });

  const response = NextResponse.json({ success: true });
  attachSessionCookie(response, token);
  return withNoStoreHeaders(response);
}
