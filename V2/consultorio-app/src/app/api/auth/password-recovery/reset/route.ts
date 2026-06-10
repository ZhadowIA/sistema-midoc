import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { resetPassword } from "../../../../../services/auth/auth-service";

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(12)
});

export async function POST(request: Request) {
  try {
    const payload = resetSchema.parse(await request.json());
    await resetPassword(payload);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "No se pudo restablecer la contrasena.");
  }
}
