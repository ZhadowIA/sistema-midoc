import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../../lib/rate-limit";
import { reschedulePublicAppointment } from "../../../../../../services/booking/public-booking-service";

const rescheduleSchema = z.object({
  newSlotStart: z.string().datetime()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const ip = requestIpFrom(request);
    if (ip) {
      await assertRateLimit({ key: `public-reschedule-ip:${ip}`, limit: 10, windowMs: 1000 * 60 * 15 });
    }

    const { token } = await context.params;
    const payload = rescheduleSchema.parse(await request.json());
    const appointment = await reschedulePublicAppointment({
      confirmationToken: token,
      newSlotStart: payload.newSlotStart
    });

    return NextResponse.json({
      appointment: {
        id: appointment.id,
        status: appointment.status,
        scheduledStart: appointment.scheduledStart,
        scheduledEnd: appointment.scheduledEnd
      }
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudo reagendar la cita.");
  }
}
