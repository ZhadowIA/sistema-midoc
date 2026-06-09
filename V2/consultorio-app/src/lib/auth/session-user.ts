import { UserRole, type User } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "./session-cookie";
import { validateAuthSession } from "../../services/auth/auth-service";

export function getSessionTokenFromCookieHeader(cookieHeader: string | null) {
  return cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
}

export async function getSessionUserFromRequest(request: Request) {
  const sessionToken = getSessionTokenFromCookieHeader(request.headers.get("cookie"));

  if (!sessionToken) {
    return null;
  }

  return validateAuthSession(sessionToken);
}

export async function requireDoctorUser(request: Request): Promise<User> {
  const user = await getSessionUserFromRequest(request);

  if (!user || user.role !== UserRole.DOCTOR) {
    throw new Error("Unauthorized");
  }

  return user;
}
