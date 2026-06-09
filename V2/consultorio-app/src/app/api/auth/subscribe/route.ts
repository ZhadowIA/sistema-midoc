import { NextResponse } from "next/server";
import { z } from "zod";

import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { createDoctorSubscription } from "../../../../services/auth/auth-service";

const subscribeSchema = z.object({
  planCode: z.string().min(1).default("ESSENTIAL")
});

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = subscribeSchema.parse(await request.json());
    const subscription = await createDoctorSubscription({
      doctorUserId: user.id,
      planCode: payload.planCode
    });

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planCode: subscription.plan.code,
        renewsAt: subscription.renewsAt
      }
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create subscription."
      },
      { status }
    );
  }
}
