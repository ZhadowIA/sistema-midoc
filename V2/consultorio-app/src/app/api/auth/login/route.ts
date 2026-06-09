import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionCookieOptions, SESSION_COOKIE_NAME } from "../../../../lib/auth/session-cookie";
import { signInDoctor } from "../../../../services/auth/auth-service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const result = await signInDoctor(payload);

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid credentials."
      },
      { status: 401 }
    );
  }
}
