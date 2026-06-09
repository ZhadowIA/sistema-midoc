import { NextResponse } from "next/server";

import { confirmPublicAppointment } from "../../../../../../services/booking/public-booking-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const appointment = await confirmPublicAppointment({
      confirmationToken: token
    });

    return NextResponse.json({ appointment });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to confirm appointment."
      },
      { status }
    );
  }
}
