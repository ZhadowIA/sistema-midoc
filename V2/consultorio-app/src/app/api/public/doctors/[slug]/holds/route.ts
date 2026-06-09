import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppointmentHold } from "../../../../../../services/booking/public-booking-service";

const holdSchema = z.object({
  serviceId: z.string().min(1),
  slotStart: z.string().datetime()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const payload = holdSchema.parse(await request.json());
    const hold = await createAppointmentHold({
      slug,
      serviceId: payload.serviceId,
      slotStart: payload.slotStart
    });

    return NextResponse.json({
      hold: {
        id: hold.id,
        token: hold.token,
        expiresAt: hold.expiresAt,
        slotStart: hold.slotStart,
        slotEnd: hold.slotEnd
      }
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create hold."
      },
      { status }
    );
  }
}
