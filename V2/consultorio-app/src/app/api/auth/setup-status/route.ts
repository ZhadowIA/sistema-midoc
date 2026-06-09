import { NextResponse } from "next/server";

import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { getDoctorSetupStatus } from "../../../../services/auth/auth-service";

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const setupStatus = await getDoctorSetupStatus(user.id);

    return NextResponse.json(setupStatus);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unauthorized"
      },
      { status: 401 }
    );
  }
}
