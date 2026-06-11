import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { requirePatientUser } from "../../../../lib/auth/session-user";
import { getPatientPortalData } from "../../../../services/patient/patient-auth-service";

export async function GET(request: Request) {
  try {
    const user = await requirePatientUser(request);
    const data = await getPatientPortalData(user.id);
    return NextResponse.json({
      patient: { firstName: user.firstName, lastName: user.lastName, email: user.email },
      ...data
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudo cargar el portal.");
  }
}
