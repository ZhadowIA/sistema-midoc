import { SignJWT } from "jose";
import type { NextResponse } from "next/server";
import { getServerEnv } from "./env";
import { SESSION_COOKIE_MAX_AGE_SECONDS } from "./sessionConfig";

const env = getServerEnv();
const secret = new TextEncoder().encode(env.NEXTAUTH_SECRET);

export type SessionClaims = {
  sub: string;
  role: string;
  bossId?: string | null;
  hasActiveSubscription?: boolean;
  onboardingCompleted?: boolean;
  productPlan?: "AGENDA" | "CLINICAL_RECORDS" | "COMBINED";
  enabledModules?: Array<"AGENDA" | "CLINICAL_RECORDS">;
  features?: Record<string, unknown>;
};

export async function buildSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_COOKIE_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export function attachSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set("med_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}
