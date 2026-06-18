import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { getDoctorAiCreditSummary } from "../../../../services/ai/ai-credits";

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const summary = await getDoctorAiCreditSummary(user.id);

    return NextResponse.json({ aiCredits: summary });
  } catch (error) {
    return toErrorResponse(error, "No se pudo obtener el saldo de creditos IA.");
  }
}
