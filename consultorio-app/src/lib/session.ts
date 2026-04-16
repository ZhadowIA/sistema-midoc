import { SignJWT } from "jose";
import type { NextResponse } from "next/server";
import { getServerEnv } from "./env";

const env = getServerEnv();
const secret = new TextEncoder().encode(env.NEXTAUTH_SECRET);

export type SessionClaims = {
  sub: string;
  role: string;
  hasActiveSubscription?: boolean;
  onboardingCompleted?: boolean;
};

export async function buildSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret);
}

export function attachSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set("med_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}
