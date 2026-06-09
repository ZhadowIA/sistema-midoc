import { NextResponse } from "next/server";
import { z } from "zod";

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to reset password."
      },
      { status: 400 }
    );
  }
}
