import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { logEvent, captureError } from "@/lib/observability";
import prisma from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { Prisma } from "@prisma/client";
import {
  COMMERCIAL_ADD_ONS,
  COMMERCIAL_BASE_PLANS,
  getCommercialCatalog,
  resolveCommercialPlan,
  type CommercialAddOn,
  type CommercialBasePlan,
} from "@/lib/subscriptionCatalog";
import { buildStripeSubscriptionLineItems } from "@/lib/stripeCatalog";

type SubscriptionScope = {
  mode: "DOCTOR" | "CLINIC";
  clinicId: string | null;
  billingDoctorId: string;
};

async function resolveSubscriptionScope(userId: string): Promise<SubscriptionScope | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, clinicId: true },
  });
  if (!user) return null;

  if (user.clinicId && user.role === "CLINIC_ADMIN") {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, ownerId: true },
    });
    return {
      mode: "CLINIC",
      clinicId: clinic?.id ?? user.clinicId,
      billingDoctorId: clinic?.ownerId ?? user.id,
    };
  }

  return {
    mode: "DOCTOR",
    clinicId: user.clinicId ?? null,
    billingDoctorId: user.id,
  };
}

async function parsePlanSelection(request: Request): Promise<{
  basePlan: CommercialBasePlan;
  addOns: CommercialAddOn[];
}> {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const validBasePlans = Object.values(COMMERCIAL_BASE_PLANS) as string[];
  const validAddOns = Object.values(COMMERCIAL_ADD_ONS) as string[];

  const basePlan =
    typeof body.basePlan === "string" && validBasePlans.includes(body.basePlan)
      ? (body.basePlan as CommercialBasePlan)
      : COMMERCIAL_BASE_PLANS.INTEGRAL;

  const addOns = Array.isArray(body.addOns)
    ? body.addOns.filter(
        (item): item is CommercialAddOn =>
          typeof item === "string" && validAddOns.includes(item),
      )
    : [];

  return { basePlan, addOns: Array.from(new Set(addOns)) };
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (authUser.role !== "DOCTOR" && authUser.role !== "ADMIN" && authUser.role !== "CLINIC_ADMIN") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const env = getServerEnv();
    const scope = await resolveSubscriptionScope(authUser.id);
    if (!scope) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const selectedPlanInput = await parsePlanSelection(request);
    const selectedPlan = resolveCommercialPlan(selectedPlanInput);

    const checkoutReference = `chk_${scope.billingDoctorId.slice(0, 8)}_${Date.now()}`;

    if (env.PAYMENTS_PROVIDER !== "STRIPE") {
      const checkoutUrl = `/medico/suscripcion?checkout=${checkoutReference}&provider=${env.PAYMENTS_PROVIDER.toLowerCase()}`;
      logEvent("info", "billing.checkout.created", {
        userId: authUser.id,
        billingDoctorId: scope.billingDoctorId,
        provider: env.PAYMENTS_PROVIDER,
        checkoutReference,
      });
      return NextResponse.json({
        success: true,
        provider: env.PAYMENTS_PROVIDER,
        checkoutReference,
        checkoutUrl,
        plan: {
          ...selectedPlan,
          catalog: getCommercialCatalog(),
        },
      });
    }

    const stripe = getStripeClient();
    const lineItems = buildStripeSubscriptionLineItems(selectedPlanInput, env);
    const doctor = await prisma.user.findUnique({
      where: { id: scope.billingDoctorId },
      select: { id: true, email: true },
    });

    if (!doctor) return NextResponse.json({ error: "Doctor no encontrado" }, { status: 404 });

    const currentSubscription = await prisma.doctorSubscription.findUnique({
      where: { doctorId: scope.billingDoctorId },
      select: { customerId: true },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: lineItems,
      customer_email: currentSubscription?.customerId ? undefined : doctor.email,
      customer: currentSubscription?.customerId ?? undefined,
      success_url: `${env.APP_BASE_URL}/medico/suscripcion?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_BASE_URL}/medico/suscripcion?checkout=cancel`,
      metadata: {
        doctorId: scope.billingDoctorId,
        initiatedByUserId: authUser.id,
        mode: scope.mode,
        basePlan: selectedPlan.basePlan,
        addOns: selectedPlan.addOns.join(","),
        displayName: selectedPlan.displayName,
      },
      subscription_data: {
        metadata: {
          doctorId: scope.billingDoctorId,
          initiatedByUserId: authUser.id,
          mode: scope.mode,
          basePlan: selectedPlan.basePlan,
          addOns: selectedPlan.addOns.join(","),
          displayName: selectedPlan.displayName,
        },
      },
    });

    await prisma.doctorSubscription.upsert({
      where: { doctorId: scope.billingDoctorId },
      create: {
        doctorId: scope.billingDoctorId,
        provider: "STRIPE",
        status: "PENDING",
        planName: selectedPlan.legacyPlanName,
        customerId: typeof session.customer === "string" ? session.customer : null,
        features: selectedPlan.features as Prisma.InputJsonValue,
      },
      update: {
        provider: "STRIPE",
        planName: selectedPlan.legacyPlanName,
        customerId: typeof session.customer === "string" ? session.customer : undefined,
        features: selectedPlan.features as Prisma.InputJsonValue,
      },
    });

    logEvent("info", "billing.checkout.created", {
      userId: authUser.id,
      billingDoctorId: scope.billingDoctorId,
      provider: "STRIPE",
      checkoutReference,
      stripeCheckoutSessionId: session.id,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe no devolvió URL de checkout" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      provider: "STRIPE",
      checkoutReference,
      checkoutUrl: session.url,
      plan: {
        ...selectedPlan,
        catalog: getCommercialCatalog(),
      },
    });
  } catch (error: unknown) {
    captureError("billing.checkout.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
