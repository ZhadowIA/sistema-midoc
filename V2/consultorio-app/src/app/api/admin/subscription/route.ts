import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import {
  cancelSubscription,
  changePlan,
  getDoctorSubscription,
  pauseSubscription,
  reactivateSubscription
} from "../../../../services/subscription/subscription-service";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("change-plan"), planCode: z.string().min(1) })
]);

function toSummary(resolved: Awaited<ReturnType<typeof getDoctorSubscription>>) {
  return {
    status: resolved.status,
    planCode: resolved.planCode,
    entitled: resolved.entitled,
    capabilities: resolved.capabilities,
    renewsAt: resolved.subscription?.renewsAt ?? null,
    cancelledAt: resolved.subscription?.cancelledAt ?? null
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const resolved = await getDoctorSubscription(user.id);
    return NextResponse.json({ subscription: toSummary(resolved) });
  } catch (error) {
    return toErrorResponse(error, "No se pudo obtener la suscripcion.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = actionSchema.parse(await request.json());

    switch (payload.action) {
      case "cancel":
        await cancelSubscription(user.id);
        break;
      case "pause":
        await pauseSubscription(user.id);
        break;
      case "reactivate":
        await reactivateSubscription(user.id);
        break;
      case "change-plan":
        await changePlan(user.id, payload.planCode);
        break;
    }

    const resolved = await getDoctorSubscription(user.id);
    return NextResponse.json({ subscription: toSummary(resolved) });
  } catch (error) {
    return toErrorResponse(error, "No se pudo actualizar la suscripcion.");
  }
}
