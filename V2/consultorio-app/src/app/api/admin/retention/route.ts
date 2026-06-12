import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { getRetentionSummary } from "../../../../services/compliance/compliance-service";

export async function GET(request: Request) {
  try {
    await requireDoctorUser(request);
    const summary = await getRetentionSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return toErrorResponse(error, "No se pudo obtener la retencion.");
  }
}
