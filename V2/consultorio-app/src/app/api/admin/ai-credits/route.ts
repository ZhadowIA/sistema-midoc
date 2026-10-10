import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { getCreditBalance, listCreditMovements } from "../../../../services/ai/credit-ledger";

// Saldo y movimientos de creditos de IA del medico (paso 29 r4), desde el libro mayor.
export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const [balance, movements] = await Promise.all([getCreditBalance(user.id), listCreditMovements(user.id)]);
    return NextResponse.json({ aiCredits: balance, movements });
  } catch (error) {
    return toErrorResponse(error, "No se pudo obtener el saldo de creditos IA.");
  }
}
