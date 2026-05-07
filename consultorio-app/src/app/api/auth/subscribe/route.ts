import { NextResponse } from "next/server";
import { addMonths } from "date-fns";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { getDoctorSetupStatus } from "@/lib/setupStatus";
import { attachSessionCookie, buildSessionToken } from "@/lib/session";
import { getServerEnv } from "@/lib/env";
import { captureError, logEvent } from "@/lib/observability";
import {
  COMMERCIAL_ADD_ONS,
  COMMERCIAL_BASE_PLANS,
  resolveCommercialPlan,
  type CommercialAddOn,
  type CommercialBasePlan,
} from "@/lib/subscriptionCatalog";
import { Prisma } from "@prisma/client";
import { buildProductAccessFromFeatures } from "@/lib/productAccess";

const PLAN_PRICES: Record<CommercialBasePlan, number> = {
  AGENDA: 299,
  CLINICAL: 449,
  INTEGRAL: 599,
};

const ADD_ON_PRICES: Record<CommercialAddOn, number> = {
  AI_30: 359,
  AI_60: 669,
  AI_100: 999,
};

function parsePlanFromBody(body: Record<string, unknown>) {
  const validBasePlans = Object.values(COMMERCIAL_BASE_PLANS) as string[];
  const validAddOns = Object.values(COMMERCIAL_ADD_ONS) as string[];

  const basePlan =
    typeof body.basePlan === "string" && validBasePlans.includes(body.basePlan)
      ? (body.basePlan as CommercialBasePlan)
      : COMMERCIAL_BASE_PLANS.INTEGRAL;

  const rawAddOns = Array.isArray(body.addOns) ? body.addOns : [];
  const addOns = rawAddOns.filter(
    (item): item is CommercialAddOn =>
      typeof item === "string" && validAddOns.includes(item),
  );

  const amount =
    PLAN_PRICES[basePlan] +
    addOns.reduce((sum, addOn) => sum + ADD_ON_PRICES[addOn], 0);

  return { basePlan, addOns, amount };
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (authUser.role !== "DOCTOR" && authUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { basePlan, addOns, amount: planAmount } = parsePlanFromBody(body);

    const env = getServerEnv();
    const now = new Date();
    const selectedPlan = resolveCommercialPlan({ basePlan, addOns });
    const MONTHLY_PLAN_AMOUNT = planAmount;
    const existing = await prisma.doctorSubscription.findUnique({
      where: { doctorId: authUser.id },
      select: { currentPeriodEnd: true, status: true },
    });

    const startAt =
      existing?.status === "ACTIVE" && existing.currentPeriodEnd && existing.currentPeriodEnd > now
        ? existing.currentPeriodEnd
        : now;
    const endAt = addMonths(startAt, 1);

    await prisma.doctorSubscription.upsert({
      where: { doctorId: authUser.id },
      create: {
        doctorId: authUser.id,
        status: "ACTIVE",
        provider: env.PAYMENTS_PROVIDER,
        planName: selectedPlan.legacyPlanName,
        amount: MONTHLY_PLAN_AMOUNT,
        currency: "MXN",
        customerId: existing ? null : `mock_cus_${authUser.id.slice(0, 8)}`,
        externalSubscriptionId: `mock_sub_${authUser.id.slice(0, 8)}_${Date.now()}`,
        externalPriceId: "mock_price_mensual_mx",
        paymentMethodLast4: "4242",
        cancelAtPeriodEnd: false,
        canceledAt: null,
        lastPaymentAt: now,
        currentPeriodStart: startAt,
        currentPeriodEnd: endAt,
        features: selectedPlan.features as Prisma.InputJsonValue,
      },
      update: {
        status: "ACTIVE",
        provider: env.PAYMENTS_PROVIDER,
        planName: selectedPlan.legacyPlanName,
        amount: MONTHLY_PLAN_AMOUNT,
        currency: "MXN",
        externalPriceId: "mock_price_mensual_mx",
        paymentMethodLast4: "4242",
        cancelAtPeriodEnd: false,
        canceledAt: null,
        lastPaymentAt: now,
        currentPeriodStart: startAt,
        currentPeriodEnd: endAt,
        features: selectedPlan.features as Prisma.InputJsonValue,
      },
    });

    await prisma.doctorOnboarding.upsert({
      where: { doctorId: authUser.id },
      create: { doctorId: authUser.id, completed: false },
      update: {},
    });

    const setup = await getDoctorSetupStatus(authUser.id, authUser.role);
    const access = buildProductAccessFromFeatures(selectedPlan.features)
    const token = await buildSessionToken({
      sub: authUser.id,
      role: authUser.role,
      hasActiveSubscription: setup.hasActiveSubscription,
      onboardingCompleted: setup.onboardingCompleted,
      productPlan: access.plan,
      enabledModules: access.enabledModules,
      features: selectedPlan.features,
    });

    const response = NextResponse.json({
      success: true,
      nextStep: setup.nextStep,
      subscription: {
        status: "ACTIVE",
        provider: env.PAYMENTS_PROVIDER,
        planName: selectedPlan.displayName,
        currentPeriodStart: startAt,
        currentPeriodEnd: endAt,
        amount: MONTHLY_PLAN_AMOUNT,
        currency: "MXN",
      },
    });
    attachSessionCookie(response, token);
    logEvent("info", "billing.subscription.activated", {
      userId: authUser.id,
      provider: env.PAYMENTS_PROVIDER,
      amount: MONTHLY_PLAN_AMOUNT,
    });
    return response;
  } catch (error: unknown) {
    captureError("billing.subscribe.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
