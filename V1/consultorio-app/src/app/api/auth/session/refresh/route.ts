import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { attachSessionCookie, buildSessionToken } from "@/lib/session";
import { jsonNoStore, withNoStoreHeaders } from "@/lib/http";
import { buildMedicalSessionClaims } from "@/server/auth/medicalSession";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return jsonNoStore({ error: "No autorizado" }, { status: 401 });
  }

  const claims = await buildMedicalSessionClaims(user, {
    twoFactorVerified: user.twoFactorVerified,
    twoFactorSetupRequired: user.twoFactorSetupRequired,
  });
  const token = await buildSessionToken(claims);

  const response = NextResponse.json({ success: true });
  attachSessionCookie(response, token);
  return withNoStoreHeaders(response);
}
