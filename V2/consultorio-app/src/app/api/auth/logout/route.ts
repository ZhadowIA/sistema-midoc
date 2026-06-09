import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "../../../../lib/auth/session-cookie";
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires: new Date(0)
  });

  return response;
}
