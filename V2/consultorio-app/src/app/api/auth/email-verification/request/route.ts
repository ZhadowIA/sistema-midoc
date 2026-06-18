import { NextResponse } from "next/server";

import { requestIpFrom, toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { requestDoctorEmailVerification } from "../../../../../services/auth/auth-service";

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const result = await requestDoctorEmailVerification({
      userId: user.id,
      requestIp: requestIpFrom(request),
      requestUserAgent: request.headers.get("user-agent") ?? undefined
    });

    return NextResponse.json({
      alreadyVerified: result.alreadyVerified
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudo enviar la verificacion de correo.");
  }
}
