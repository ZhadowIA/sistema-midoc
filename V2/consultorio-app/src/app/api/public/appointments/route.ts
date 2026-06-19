import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { bookPublicAppointment } from "../../../../services/booking/public-booking-service";

const appointmentSchema = z.object({
  holdToken: z.string().min(1),
  patient: z
    .object({
      firstName: z.string().min(1),
      // Apellido paterno obligatorio; materno opcional. `lastName` combinado se
      // mantiene para compatibilidad con clientes/llamadas legadas.
      apellidoPaterno: z.string().min(1).max(120).optional(),
      apellidoMaterno: z.string().max(120).optional(),
      lastName: z.string().min(1).optional(),
      phone: z.string().min(7).optional(),
      email: z.string().email().optional(),
      birthDate: z.string().date().optional()
    })
    .refine((patient) => Boolean(patient.apellidoPaterno || patient.lastName), {
      message: "Se requiere el apellido paterno.",
      path: ["apellidoPaterno"]
    }),
  reason: z.string().max(1000).optional(),
  contact: z
    .object({
      fullName: z.string().min(1),
      relationship: z.string().max(100).optional(),
      phone: z.string().min(7).optional(),
      email: z.string().email().optional()
    })
    .optional(),
  legal: z.object({
    acceptedTerms: z.boolean(),
    acceptedPrivacy: z.boolean(),
    notificationConsent: z
      .object({
        sms: z.boolean().optional(),
        whatsapp: z.boolean().optional(),
        preferredPhoneChannel: z.enum(["SMS", "WHATSAPP"]).optional()
      })
      .optional()
  })
});

export async function POST(request: Request) {
  try {
    const ip = requestIpFrom(request);
    if (ip) {
      assertRateLimit({ key: `public-book-ip:${ip}`, limit: 10, windowMs: 1000 * 60 * 15 });
    }

    const payload = appointmentSchema.parse(await request.json());
    const appointment = await bookPublicAppointment({
      ...payload,
      legal: {
        ...payload.legal,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") ?? undefined
      }
    });

    return NextResponse.json(
      {
        appointment: {
          id: appointment.appointment.id,
          status: appointment.appointment.status,
          confirmationToken: appointment.confirmationToken,
          patientId: appointment.patient.id
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear la cita.");
  }
}
