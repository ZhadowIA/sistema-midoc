import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../lib/api-error";
import { env } from "../../../../lib/env";
import { createDoctorAccount } from "../../../../services/auth/auth-service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(7).optional(),
  professionalName: z.string().min(1),
  specialty: z.enum(["GENERAL_MEDICINE", "ODONTOLOGY"])
});

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());

    const result = await createDoctorAccount({
      ...payload,
      termsVersion: env.TERMS_VERSION,
      privacyVersion: env.PRIVACY_VERSION,
      requestIp: requestIpFrom(request)
    });

    return NextResponse.json(
      {
        user: {
          id: result.user.id,
          email: result.user.email
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear la cuenta.");
  }
}
