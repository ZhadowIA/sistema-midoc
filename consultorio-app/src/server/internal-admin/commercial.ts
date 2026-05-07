import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCommercialCatalog, resolveCommercialPlanFromSubscription } from "@/lib/subscriptionCatalog";
import { buildBillingStatus, readPayloadData } from "@/server/subscription/helpers";
import { AuditLogService } from "@/services/AuditLogService";
import {
  buildCommercialDiff,
  buildManagedCommercialState,
  getBasePlanFromFeatures,
  getEnabledFeatureKeys,
  getMonthlyPriceTotal,
  getPrimaryAiAddOn,
  type ManagedAiOverrides,
} from "@/server/internal-admin/commercialHelpers";

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
const SEVEN_DAYS_MS = 1000 * 60 * 60 * 24 * 7;
const FOURTEEN_DAYS_MS = 1000 * 60 * 60 * 24 * 14;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function toNullableIsoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function normalizePaymentRisk(status: string | null | undefined, cancelAtPeriodEnd: boolean) {
  if (status === "PAST_DUE") return "HIGH";
  if (cancelAtPeriodEnd) return "MEDIUM";
  return "LOW";
}

function pickLatestIso(...values: Array<string | null>) {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export type ListCommercialClientsInput = {
  search?: string;
  plan?: "ALL" | "AGENDA" | "CLINICAL" | "INTEGRAL";
  status?: "ALL" | "ACTIVE" | "PAST_DUE" | "PENDING" | "CANCELED" | "NO_SUBSCRIPTION";
  ai?: "ALL" | "WITH_AI" | "WITHOUT_AI";
  active?: "ALL" | "ACTIVE" | "INACTIVE";
  risk?: "ALL" | "LOW" | "MEDIUM" | "HIGH";
  page?: number;
  pageSize?: number;
};

export async function listCommercialClients(input: ListCommercialClientsInput = {}) {
  const windowStart = new Date(Date.now() - THIRTY_DAYS_MS);
  const sevenDaysStart = new Date(Date.now() - SEVEN_DAYS_MS);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: "DOCTOR" },
        { ownedClinic: { isNot: null } },
        { subscription: { isNot: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      clinic: { select: { id: true, name: true, slug: true, active: true } },
      ownedClinic: { select: { id: true, name: true, slug: true, active: true } },
      subscription: {
        select: {
          status: true,
          planName: true,
          amount: true,
          currency: true,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: true,
          updatedAt: true,
          features: true,
          provider: true,
          externalSubscriptionId: true,
          customerId: true,
          paymentMethodLast4: true,
          lastPaymentAt: true,
        },
      },
    },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
  });

  const doctorIds = users.map((user) => user.id);

  const [aiUsageRows, aiFailureRows, appointmentRows, notificationFailureRows, paymentEvents] = await Promise.all([
    prisma.aIUsageEvent.groupBy({
      by: ["doctorId"],
      where: {
        doctorId: { in: doctorIds },
        createdAt: { gte: windowStart },
      },
      _count: { _all: true },
      _sum: { totalTokens: true, estimatedCostUsd: true },
      _max: { createdAt: true },
    }),
    prisma.aIUsageEvent.groupBy({
      by: ["doctorId"],
      where: {
        doctorId: { in: doctorIds },
        createdAt: { gte: sevenDaysStart },
        status: "FAILED",
      },
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({
      by: ["doctorId"],
      where: {
        doctorId: { in: doctorIds },
        createdAt: { gte: windowStart },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.notification.groupBy({
      by: ["appointmentId"],
      where: {
        status: "FAILED",
        createdAt: { gte: sevenDaysStart },
        appointment: { doctorId: { in: doctorIds } },
      },
      _count: { _all: true },
    }).then(async (rows) => {
      if (rows.length === 0) return new Map<string, number>();
      const appointmentIds = rows.map((r) => r.appointmentId);
      const appts = await prisma.appointment.findMany({
        where: { id: { in: appointmentIds } },
        select: { id: true, doctorId: true },
      });
      const apptDoctorMap = new Map(appts.map((a) => [a.id, a.doctorId]));
      const countByDoctor = new Map<string, number>();
      for (const row of rows) {
        const doctorId = apptDoctorMap.get(row.appointmentId);
        if (!doctorId) continue;
        countByDoctor.set(doctorId, (countByDoctor.get(doctorId) ?? 0) + row._count._all);
      }
      return countByDoctor;
    }),
    prisma.paymentWebhookEvent.findMany({
      where: {
        eventType: {
          in: [
            "checkout.session.completed",
            "invoice.paid",
            "invoice.payment_failed",
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        provider: true,
        createdAt: true,
        payload: true,
      },
    }),
  ]);

  const aiUsageByDoctor = new Map(
    aiUsageRows.map((row) => [
      row.doctorId,
      {
        jobs: row._count._all,
        totalTokens: row._sum.totalTokens ?? 0,
        estimatedCostUsd: toNumber(row._sum.estimatedCostUsd),
        lastUsedAt: toNullableIsoDate(row._max.createdAt),
      },
    ]),
  );

  const aiFailuresByDoctor = new Map(aiFailureRows.map((row) => [row.doctorId, row._count._all]));

  const appointmentsByDoctor = new Map(
    appointmentRows.map((row) => [
      row.doctorId,
      {
        appointments30d: row._count._all,
        lastAppointmentAt: toNullableIsoDate(row._max.createdAt),
      },
    ]),
  );

  const notificationFailuresByDoctor = notificationFailureRows;

  const paymentByKey = new Map<string, string>();
  for (const event of paymentEvents) {
    const data = readPayloadData(event.payload);
    const customerId = typeof data.customerId === "string" ? data.customerId : null;
    const subscriptionId = typeof data.subscriptionId === "string" ? data.subscriptionId : null;
    if (customerId) {
      paymentByKey.set(`customer:${event.provider}:${customerId}`, event.createdAt.toISOString());
    }
    if (subscriptionId) {
      paymentByKey.set(`subscription:${event.provider}:${subscriptionId}`, event.createdAt.toISOString());
    }
  }

  const clients = users.map((user) => {
    const subscription = user.subscription;
    const commercialPlan = subscription
      ? resolveCommercialPlanFromSubscription({
        planName: subscription.planName,
        features: subscription.features,
      })
      : null;
    const basePlan = commercialPlan?.basePlan ?? getBasePlanFromFeatures(subscription?.features);
    const addOn = getPrimaryAiAddOn(subscription?.features && typeof subscription.features === "object"
      ? (subscription.features as Record<string, unknown>)["subscription.addOns"]
      : null);

    const aiUsage = aiUsageByDoctor.get(user.id) ?? {
      jobs: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      lastUsedAt: null,
    };
    const appointments = appointmentsByDoctor.get(user.id) ?? {
      appointments30d: 0,
      lastAppointmentAt: null,
    };

    const lastPaymentEventAt =
      (subscription?.customerId && paymentByKey.get(`customer:${subscription.provider}:${subscription.customerId}`)) ||
      (subscription?.externalSubscriptionId &&
        paymentByKey.get(`subscription:${subscription.provider}:${subscription.externalSubscriptionId}`)) ||
      null;

    const lastActivityAt = pickLatestIso(
      user.updatedAt.toISOString(),
      toNullableIsoDate(subscription?.updatedAt),
      aiUsage.lastUsedAt,
      appointments.lastAppointmentAt,
      lastPaymentEventAt,
    );

    const paymentRisk = normalizePaymentRisk(subscription?.status, subscription?.cancelAtPeriodEnd ?? false);
    const hasAiAddOn = Boolean(addOn);
    const lowAiAdoption = hasAiAddOn && aiUsage.jobs < 5;
    const lowRecentActivity = !lastActivityAt || Date.now() - Date.parse(lastActivityAt) > FOURTEEN_DAYS_MS;
    const upgradeCandidate =
      basePlan !== "INTEGRAL" && appointments.appointments30d >= 20;
    const aiFailures7d = aiFailuresByDoctor.get(user.id) ?? 0;
    const notificationsFailed7d = notificationFailuresByDoctor.get(user.id) ?? 0;
    const aiAdoptionPct30d = appointments.appointments30d > 0
      ? Math.min(100, Math.round((aiUsage.jobs / appointments.appointments30d) * 100))
      : 0;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      tenantName: user.ownedClinic?.name ?? user.clinic?.name ?? "Consultorio individual",
      tenantSlug: user.ownedClinic?.slug ?? user.clinic?.slug ?? null,
      subscriptionStatus: subscription?.status ?? "NO_SUBSCRIPTION",
      basePlan,
      addOn,
      commercialPlanName: commercialPlan?.displayName ?? subscription?.planName ?? "Sin plan",
      amount: subscription?.amount ? toNumber(subscription.amount) : 0,
      currency: subscription?.currency ?? "MXN",
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: toNullableIsoDate(subscription?.currentPeriodEnd),
      paymentRisk,
      hasAiAddOn,
      lowAiAdoption,
      aiUsage30d: aiUsage,
      appointments30d: appointments.appointments30d,
      lastAppointmentAt: appointments.lastAppointmentAt,
      notificationsFailed7d,
      lastActivityAt,
      lowRecentActivity,
      upgradeCandidate,
      aiFailures7d,
      aiAdoptionPct30d,
    };
  });

  const search = (input.search ?? "").trim().toLowerCase();
  const plan = input.plan ?? "ALL";
  const status = input.status ?? "ALL";
  const ai = input.ai ?? "ALL";
  const active = input.active ?? "ALL";
  const risk = input.risk ?? "ALL";

  const filtered = clients.filter((client) => {
    const matchesSearch = !search || `${client.name} ${client.email} ${client.tenantName}`.toLowerCase().includes(search);
    const matchesPlan = plan === "ALL" || client.basePlan === plan;
    const matchesStatus = status === "ALL" || client.subscriptionStatus === status;
    const matchesAi = ai === "ALL" || (ai === "WITH_AI" ? client.hasAiAddOn : !client.hasAiAddOn);
    const matchesActive = active === "ALL" || (active === "ACTIVE" ? client.active : !client.active);
    const matchesRisk = risk === "ALL" || client.paymentRisk === risk;
    return matchesSearch && matchesPlan && matchesStatus && matchesAi && matchesActive && matchesRisk;
  });

  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const page = Math.max(1, input.page ?? 1);
  const offset = (page - 1) * pageSize;
  const paged = filtered.slice(offset, offset + pageSize);

  const activeClients = filtered.filter((client) => client.active);
  const estimatedMrr = activeClients.reduce((sum, client) => sum + client.amount, 0);
  const withAi = filtered.filter((client) => client.hasAiAddOn).length;
  const withoutAi = filtered.length - withAi;
  const paymentRiskCount = filtered.filter((client) => client.paymentRisk !== "LOW").length;
  const estimatedAiCost30d = filtered.reduce((sum, client) => sum + client.aiUsage30d.estimatedCostUsd, 0);
  const lowActivityCount = filtered.filter((client) => client.lowRecentActivity).length;

  return {
    clients: paged,
    pagination: { page, pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) },
    dashboard: {
      totals: {
        clients: clients.length,
        activeClients: activeClients.length,
        estimatedMrr,
        paymentRiskCount,
        withAi,
        withoutAi,
        estimatedAiCost30d,
        lowActivityCount,
      },
      topAiClients: [...clients]
        .sort((a, b) => b.aiUsage30d.estimatedCostUsd - a.aiUsage30d.estimatedCostUsd)
        .slice(0, 5),
      underusedAiClients: clients
        .filter((client) => client.lowAiAdoption)
        .sort((a, b) => a.aiUsage30d.jobs - b.aiUsage30d.jobs)
        .slice(0, 5),
      upgradeCandidates: clients
        .filter((client) => client.upgradeCandidate)
        .sort((a, b) => b.appointments30d - a.appointments30d)
        .slice(0, 5),
      churnRiskClients: clients
        .filter((client) => client.paymentRisk !== "LOW" || client.cancelAtPeriodEnd)
        .slice(0, 5),
    },
  };
}

export async function getCommercialClientDetail(doctorId: string) {
  const user = await prisma.user.findUnique({
    where: { id: doctorId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      specialty: true,
      clinic: { select: { id: true, name: true, slug: true, active: true } },
      ownedClinic: { select: { id: true, name: true, slug: true, active: true } },
      subscription: true,
    },
  });
  if (!user) return null;

  const subscriptionOverview = await import("@/server/subscription/getSubscriptionOverview").then((mod) =>
    mod.getSubscriptionOverview(doctorId),
  );

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const [usageRows, appointmentCount, latestAppointments] = await Promise.all([
    prisma.aIUsageEvent.findMany({
      where: {
        doctorId,
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
        sourceModule: true,
        totalTokens: true,
        estimatedCostUsd: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.appointment.count({
      where: {
        doctorId,
        createdAt: { gte: since },
      },
    }),
    prisma.appointment.findMany({
      where: { doctorId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        status: true,
        patient: {
          select: {
            firstName: true,
            lastNamePaternal: true,
          },
        },
      },
    }),
  ]);

  const usageByModule = new Map<string, { jobs: number; estimatedCostUsd: number; totalTokens: number }>();
  let estimatedCostUsd30d = 0;
  let totalTokens30d = 0;

  for (const row of usageRows) {
    estimatedCostUsd30d += toNumber(row.estimatedCostUsd);
    totalTokens30d += row.totalTokens;
    const current = usageByModule.get(row.sourceModule) ?? {
      jobs: 0,
      estimatedCostUsd: 0,
      totalTokens: 0,
    };
    current.jobs += 1;
    current.estimatedCostUsd += toNumber(row.estimatedCostUsd);
    current.totalTokens += row.totalTokens;
    usageByModule.set(row.sourceModule, current);
  }

  const features = user.subscription?.features && typeof user.subscription.features === "object"
    ? (user.subscription.features as Record<string, unknown>)
    : {};

  const basePlan = getBasePlanFromFeatures(features);
  const addOn = getPrimaryAiAddOn(features["subscription.addOns"]);

  return {
    client: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      specialty: user.specialty,
      active: user.active,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      tenantName: user.ownedClinic?.name ?? user.clinic?.name ?? "Consultorio individual",
      basePlan,
      addOn,
      enabledFeatures: getEnabledFeatureKeys(features),
      aiOverrides: {
        "ai.dictation": features["ai.dictation"] === true,
        "ai.insights": features["ai.insights"] === true,
        "ai.questionnaire.text": features["ai.questionnaire.text"] === true,
        "ai.questionnaire.audio": features["ai.questionnaire.audio"] === true,
      },
    },
    subscriptionOverview: subscriptionOverview
      ? {
        ...subscriptionOverview,
        subscription: subscriptionOverview.subscription
          ? {
            ...subscriptionOverview.subscription,
            amount: subscriptionOverview.subscription.amount
              ? toNumber(subscriptionOverview.subscription.amount)
              : null,
            currentPeriodStart: toNullableIsoDate(subscriptionOverview.subscription.currentPeriodStart),
            currentPeriodEnd: toNullableIsoDate(subscriptionOverview.subscription.currentPeriodEnd),
            lastPaymentAt: toNullableIsoDate(subscriptionOverview.subscription.lastPaymentAt),
            canceledAt: toNullableIsoDate(subscriptionOverview.subscription.canceledAt),
            createdAt: toNullableIsoDate(subscriptionOverview.subscription.createdAt),
            updatedAt: toNullableIsoDate(subscriptionOverview.subscription.updatedAt),
          }
          : null,
      }
      : null,
    aiUsage: {
      totals: {
        jobs: usageRows.length,
        estimatedCostUsd30d,
        totalTokens30d,
        appointments30d: appointmentCount,
      },
      byModule: Array.from(usageByModule.entries())
        .map(([module, stats]) => ({ module, ...stats }))
        .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
    },
    latestAppointments: latestAppointments.map((appointment) => ({
      id: appointment.id,
      createdAt: appointment.createdAt.toISOString(),
      status: appointment.status,
      patientName: `${appointment.patient.firstName} ${appointment.patient.lastNamePaternal}`.trim(),
    })),
  };
}

export async function updateCommercialClient(
  input: {
    actorUserId: string;
    doctorId: string;
    basePlan: "AGENDA" | "CLINICAL" | "INTEGRAL";
    addOn: "AI_30" | "AI_60" | "AI_100" | null;
    aiOverrides?: ManagedAiOverrides;
    active?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
) {
  const target = await prisma.user.findUnique({
    where: { id: input.doctorId },
    select: {
      id: true,
      active: true,
      subscription: true,
    },
  });
  if (!target) return null;

  const nextState = buildManagedCommercialState({
    basePlan: input.basePlan,
    addOn: input.addOn,
    aiOverrides: input.aiOverrides,
  });

  const previousPlan = target.subscription
    ? resolveCommercialPlanFromSubscription({
      planName: target.subscription.planName,
      features: target.subscription.features,
    })
    : null;

  const previousFeatures =
    target.subscription?.features && typeof target.subscription.features === "object"
      ? (target.subscription.features as Record<string, unknown>)
      : {};

  const diff = buildCommercialDiff(
    {
      basePlan: previousPlan?.basePlan ?? nextState.basePlan,
      addOn: getPrimaryAiAddOn(previousFeatures["subscription.addOns"]),
      features: previousFeatures,
    },
    {
      basePlan: nextState.basePlan,
      addOn: input.addOn,
      features: nextState.features,
    },
  );

  const amount = getMonthlyPriceTotal(nextState);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.doctorId },
      data: {
        ...(typeof input.active === "boolean" ? { active: input.active } : {}),
      },
    });

    if (target.subscription) {
      await tx.doctorSubscription.update({
        where: { doctorId: input.doctorId },
        data: {
          planName: nextState.displayName,
          amount,
          currency: "MXN",
          status: target.subscription.status === "CANCELED" ? "ACTIVE" : target.subscription.status,
          features: nextState.features as Prisma.InputJsonValue,
        },
      });
    } else {
      await tx.doctorSubscription.create({
        data: {
          doctorId: input.doctorId,
          status: "ACTIVE",
          provider: "MOCK",
          planName: nextState.displayName,
          amount,
          currency: "MXN",
          currentPeriodStart: new Date(),
          features: nextState.features as Prisma.InputJsonValue,
        },
      });
    }

    await AuditLogService.log({
      doctorId: input.doctorId,
      actorUserId: input.actorUserId,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "internal_admin.commercial_update",
      metadata: {
        previousStatus: target.subscription?.status ?? "NO_SUBSCRIPTION",
        basePlan: nextState.basePlan,
        addOn: input.addOn,
        amount,
        active: typeof input.active === "boolean" ? input.active : target.active,
        diff,
      },
    }, tx);
  });

  const detail = await getCommercialClientDetail(input.doctorId);
  return {
    detail,
    diff,
  };
}
