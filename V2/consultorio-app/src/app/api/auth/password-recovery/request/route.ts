import { NextResponse } from "next/server";
import { z } from "zod";

import { requestPasswordReset } from "../../../../../services/auth/auth-service";

const requestSchema = z.object({
  email: z.string().email()
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const forwardedFor = request.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const result = await requestPasswordReset({
      email: payload.email,
      requestIp: forwardedFor,
      requestUserAgent: userAgent
    });

    return NextResponse.json({
      message: result.message
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to process password reset."
      },
      { status: 400 }
    );
  }
}
