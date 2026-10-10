import { AiCreditGrantKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../../lib/api-error";
import { requireAdminUser } from "../../../../../../lib/auth/session-user";
import { getCreditBalance, grantCredits } from "../../../../../../services/ai/credit-ledger";

// Abono manual de creditos por el administrador (paso 29 r3) mientras no exista
// la compra de recargas en linea (paso 17): recarga o ajuste, sin caducidad.
const grantSchema = z.object({
  kind: z.enum([AiCreditGrantKind.TOP_UP, AiCreditGrantKind.ADJUSTMENT]),
  credits: z.number().int().min(1).max(1_000_000),
  note: z.string().max(200).optional()
});

export async function POST(request: Request, context: { params: Promise<{ doctorId: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { doctorId } = await context.params;
    const payload = grantSchema.parse(await request.json());
    await grantCredits({ ...payload, doctorUserId: doctorId, actorUserId: admin.id });
    const balance = await getCreditBalance(doctorId);
    return NextResponse.json({ balance: balance.balance }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron abonar los creditos.");
  }
}
