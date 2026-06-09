import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "../../../../lib/auth/session-cookie";
import { validateAuthSession } from "../../../../services/auth/auth-service";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];

  if (!sessionToken) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await validateAuthSession(sessionToken);

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    }
  });
}
