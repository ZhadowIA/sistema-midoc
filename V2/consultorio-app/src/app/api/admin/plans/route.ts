import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { listAvailablePlans } from "../../../../services/subscription/subscription-service";

export async function GET(request: Request) {
  try {
    await requireDoctorUser(request);
    const plans = await listAvailablePlans();
    return NextResponse.json({
      plans: plans.map((plan) => ({
        code: plan.code,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        capabilities: plan.capabilities ?? {}
      }))
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron obtener los planes.");
  }
}
