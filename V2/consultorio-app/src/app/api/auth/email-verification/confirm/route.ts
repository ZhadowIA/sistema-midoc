import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { confirmDoctorEmailVerification } from "../../../../../services/auth/auth-service";

const confirmSchema = z.object({
  token: z.string().min(20)
});

export async function POST(request: Request) {
  try {
    const payload = confirmSchema.parse(await request.json());
    const result = await confirmDoctorEmailVerification({ token: payload.token });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "No se pudo verificar el correo.");
  }
}
