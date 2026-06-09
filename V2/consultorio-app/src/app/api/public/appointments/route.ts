import { NextResponse } from "next/server";
import { z } from "zod";

import { bookPublicAppointment } from "../../../../services/booking/public-booking-service";

const appointmentSchema = z.object({
  holdToken: z.string().min(1),
  patient: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().min(7).optional(),
    email: z.string().email().optional(),
    birthDate: z.string().date().optional()
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
    acceptedPrivacy: z.boolean()
  })
});

export async function POST(request: Request) {
  try {
    const payload = appointmentSchema.parse(await request.json());
    const appointment = await bookPublicAppointment({
      ...payload,
      legal: {
        ...payload.legal,
        ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
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
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create appointment."
      },
      { status }
    );
  }
}
