import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../../lib/rate-limit";
import { createAppointmentHold } from "../../../../../../services/booking/public-booking-service";

const holdSchema = z.object({
  serviceId: z.string().min(1),
  slotStart: z.string().datetime(),
  // Hold previo del paciente en la misma sesion (para liberarlo al cambiar de
  // horario). Opcional.
  previousHoldToken: z.string().min(1).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const ip = requestIpFrom(request);
    if (ip) {
      await assertRateLimit({ key: `public-hold-ip:${ip}`, limit: 30, windowMs: 1000 * 60 * 15 });
    }

    const { slug } = await context.params;
    const payload = holdSchema.parse(await request.json());
    const hold = await createAppointmentHold({
      slug,
      serviceId: payload.serviceId,
      slotStart: payload.slotStart,
      previousHoldToken: payload.previousHoldToken
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
    return toErrorResponse(error, "No se pudo apartar el horario.");
  }
}
