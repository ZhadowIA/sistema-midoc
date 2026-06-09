import { NextResponse } from "next/server";
import { z } from "zod";

import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { createAvailabilityBlock, getDoctorWorkspace } from "../../../../../services/doctor/doctor-profile-service";

const blockSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().max(500).optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const workspace = await getDoctorWorkspace(user.id);
    return NextResponse.json({
      blocks: workspace.availabilityBlocks
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unauthorized"
      },
      { status: 401 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = blockSchema.parse(await request.json());
    const block = await createAvailabilityBlock(user.id, payload);

    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create availability block."
      },
      { status }
    );
  }
}
