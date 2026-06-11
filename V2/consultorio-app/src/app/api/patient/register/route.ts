import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../lib/api-error";
import { createSessionCookieOptions, SESSION_COOKIE_NAME } from "../../../../lib/auth/session-cookie";
import { env } from "../../../../lib/env";
import {
  registerPatientAccount,
  signInPatient
} from "../../../../services/patient/patient-auth-service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  acceptedTerms: z.literal(true),
  acceptedPrivacy: z.literal(true)
});

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());
    const requestIp = requestIpFrom(request);

    await registerPatientAccount({
      email: payload.email,
      password: payload.password,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone,
      termsVersion: env.TERMS_VERSION,
      privacyVersion: env.PRIVACY_VERSION,
      requestIp
    });

    // Inicia sesion inmediatamente tras el registro.
    const session = await signInPatient({
      email: payload.email,
      password: payload.password,
      requestIp
    });

    const response = NextResponse.json(
      {
        user: {
          id: session.user.id,
          email: session.user.email,
          firstName: session.user.firstName,
          lastName: session.user.lastName
        }
      },
      { status: 201 }
    );
    response.cookies.set(
      SESSION_COOKIE_NAME,
      session.sessionToken,
      createSessionCookieOptions(session.expiresAt)
    );
    return response;
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear la cuenta.");
  }
}
