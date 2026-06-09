import { NextResponse } from "next/server";
import { z } from "zod";

import { requireDoctorUser } from "../../../../../../lib/auth/session-user";
import { closeEncounter } from "../../../../../../services/clinical/encounter-service";

const closeSchema = z.object({
  closingSummary: z.string().optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ encounterId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const { encounterId } = await context.params;
    const payload = closeSchema.parse(await request.json());

    await closeEncounter({
      doctorUserId: user.id,
      encounterId,
      closingSummary: payload.closingSummary
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to close encounter."
      },
      { status }
    );
  }
}
