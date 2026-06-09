import { NextResponse } from "next/server";

import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { listDoctorAppointments } from "../../../../services/booking/public-booking-service";

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const appointments = await listDoctorAppointments(user.id);

    return NextResponse.json({ appointments });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unauthorized"
      },
      { status: 401 }
    );
  }
}
