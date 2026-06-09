import { NextResponse } from "next/server";

import { getPublicAppointmentByToken } from "../../../../../services/booking/public-booking-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const details = await getPublicAppointmentByToken(token);

  if (!details) {
    return NextResponse.json(
      {
        error: "Appointment not found."
      },
      { status: 404 }
    );
  }

  return NextResponse.json(details);
}
