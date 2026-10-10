import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../../../lib/auth/session-user";
import { getLicenseOverview, releaseActivation } from "../../../../../../../services/license/license-service";

// El medico libera un equipo desde su cuenta para activar otro (paso 29 r4).
// No apaga la licencia que ese equipo ya tiene: solo deja el lugar.
export async function POST(request: Request, context: { params: Promise<{ activationId: string }> }) {
  try {
    const user = await requireDoctorUser(request);
    const { activationId } = await context.params;
    await releaseActivation(user.id, activationId);
    return NextResponse.json(await getLicenseOverview(user.id));
  } catch (error) {
    return toErrorResponse(error, "No se pudo liberar el equipo.");
  }
}
