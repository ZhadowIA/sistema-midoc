import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { regenerateRecoveryCodes } from "../../../../../services/auth/two-factor-service";

const schema = z.object({ code: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = schema.parse(await request.json());
    const result = await regenerateRecoveryCodes(user.id, payload.code);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "No se pudieron regenerar los codigos.");
  }
}
