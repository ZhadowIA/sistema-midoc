import { NextResponse } from "next/server";
import { z } from "zod";

import { submitPrecheckin } from "../../../../../../services/booking/public-booking-service";

const precheckinSchema = z.object({
  responses: z.record(z.string(), z.unknown())
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const payload = precheckinSchema.parse(await request.json());
    const precheckin = await submitPrecheckin({
      confirmationToken: token,
      responses: payload.responses
    });

    return NextResponse.json({ precheckin });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save precheckin."
      },
      { status }
    );
  }
}
