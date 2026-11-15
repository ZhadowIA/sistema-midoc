import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  createSessionCookieOptions
} from "../../../../lib/auth/session-cookie";
import { revokeAuthSession } from "../../../../services/auth/auth-service";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];

  if (sessionToken) {
    await revokeAuthSession(sessionToken);
  }

  // Mismos atributos (HttpOnly, SameSite, Secure, Path) que al crear la sesion:
  // si difieren, el navegador puede conservar la cookie original.
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", createSessionCookieOptions(new Date(0)));

  return response;
}
