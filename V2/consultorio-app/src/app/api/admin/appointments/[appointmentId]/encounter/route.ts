import { NextResponse } from "next/server";

import { requireDoctorUser } from "../../../../../../lib/auth/session-user";
import {
  getEncounterWorkspaceByAppointment,
  openEncounterFromAppointment
} from "../../../../../../services/clinical/encounter-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const { appointmentId } = await context.params;
    const workspace = await getEncounterWorkspaceByAppointment({
      doctorUserId: user.id,
      appointmentId
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 401;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load encounter."
      },
      { status }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const { appointmentId } = await context.params;
    const workspace = await openEncounterFromAppointment({
      doctorUserId: user.id,
      appointmentId
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to open encounter."
      },
      { status }
    );
  }
}
