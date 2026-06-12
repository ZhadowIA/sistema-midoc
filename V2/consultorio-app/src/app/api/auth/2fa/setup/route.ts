import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { beginTwoFactorEnrollment } from "../../../../../services/auth/two-factor-service";

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const enrollment = await beginTwoFactorEnrollment(user.id);
    return NextResponse.json(enrollment);
  } catch (error) {
    return toErrorResponse(error, "No se pudo iniciar el 2FA.");
  }
}
