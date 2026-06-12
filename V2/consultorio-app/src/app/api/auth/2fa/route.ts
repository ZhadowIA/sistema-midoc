import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { isTwoFactorEnabled } from "../../../../services/auth/two-factor-service";

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    return NextResponse.json({ enabled: await isTwoFactorEnabled(user.id) });
  } catch (error) {
    return toErrorResponse(error, "No se pudo obtener el estado de 2FA.");
  }
}
