import { env } from "../env";

export const SESSION_COOKIE_NAME = "med_token";

export function createSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.APP_BASE_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt
  };
}
