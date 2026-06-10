import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../../lib/api-error";
import { requestPasswordReset } from "../../../../../services/auth/auth-service";

const requestSchema = z.object({
  email: z.string().email()
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const result = await requestPasswordReset({
      email: payload.email,
      requestIp: requestIpFrom(request),
      requestUserAgent: userAgent
    });

    return NextResponse.json({
      message: result.message
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudo procesar la solicitud.");
  }
}
