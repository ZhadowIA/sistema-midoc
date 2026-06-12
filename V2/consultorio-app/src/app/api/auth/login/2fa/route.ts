import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import {
  createSessionCookieOptions,
  SESSION_COOKIE_NAME
} from "../../../../../lib/auth/session-cookie";
import { completeTwoFactorLogin } from "../../../../../services/auth/auth-service";

const schema = z.object({
  twoFactorToken: z.string().min(1),
  code: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const result = await completeTwoFactorLogin(payload);

    const response = NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role
      }
    });

    response.cookies.set(
      SESSION_COOKIE_NAME,
      result.sessionToken,
      createSessionCookieOptions(result.expiresAt)
    );

    return response;
  } catch (error) {
    return toErrorResponse(error, "No se pudo verificar el segundo factor.");
  }
}
