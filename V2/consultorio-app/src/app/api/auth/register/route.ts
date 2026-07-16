import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../lib/api-error";
import { env } from "../../../../lib/env";
import { createDoctorAccount } from "../../../../services/auth/auth-service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  passwordConfirmation: z.string().min(1).optional(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(120),
  // `phone` se conserva durante la transición para clientes ya publicados.
  personalPhone: z.string().min(7).max(20).optional(),
  patientContactPhone: z.string().min(7).max(20).optional(),
  phone: z.string().min(7).max(20).optional(),
  professionalName: z.string().min(5).max(120),
  licenseNumber: z.string().min(5).max(30),
  specialty: z.enum(["GENERAL_MEDICINE", "ODONTOLOGY"])
});

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());

    const result = await createDoctorAccount({
      ...payload,
      termsVersion: env.TERMS_VERSION,
      privacyVersion: env.PRIVACY_VERSION,
      requestIp: requestIpFrom(request),
      requestUserAgent: request.headers.get("user-agent") ?? undefined
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
