import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../lib/api-error";
import { createSessionCookieOptions, SESSION_COOKIE_NAME } from "../../../../lib/auth/session-cookie";
import { signInPatient } from "../../../../services/patient/patient-auth-service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const result = await signInPatient({ ...payload, requestIp: requestIpFrom(request) });

    const response = NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName
      }
    });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      result.sessionToken,
      createSessionCookieOptions(result.expiresAt)
    );
    return response;
  } catch (error) {
    return toErrorResponse(error, "No se pudo iniciar sesion.");
  }
}
