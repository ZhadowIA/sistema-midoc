import { NextResponse } from "next/server";
import { z } from "zod";

import { cancelPublicAppointment } from "../../../../../../services/booking/public-booking-service";

const cancelSchema = z.object({
  reason: z.string().max(500).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const payload = cancelSchema.parse(await request.json());
    const appointment = await cancelPublicAppointment({
      confirmationToken: token,
      reason: payload.reason
    });

    return NextResponse.json({ appointment });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to cancel appointment."
      },
      { status }
    );
  }
}
