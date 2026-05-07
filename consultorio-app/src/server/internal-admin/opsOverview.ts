import prisma from "@/lib/prisma";

const ONE_HOUR_MS = 1000 * 60 * 60;
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

export async function getOpsOverview() {
  const hourAgo = new Date(Date.now() - ONE_HOUR_MS);
  const since30d = new Date(Date.now() - THIRTY_DAYS_MS);

  const [paymentWebhookFailed1h, notificationsFailed1h, aiJobsFailed1h, paymentWebhookEvents1h, aiUsage30d] = await Promise.all([
    prisma.paymentWebhookEvent.count({
      where: {
        createdAt: { gte: hourAgo },
        status: { in: ["FAILED", "ERROR"] },
      },
    }),
    prisma.notification.count({
      where: {
        createdAt: { gte: hourAgo },
        status: "FAILED",
      },
    }),
    prisma.aIProcessingJob.count({
      where: {
        createdAt: { gte: hourAgo },
        status: "FAILED",
      },
    }),
    prisma.paymentWebhookEvent.count({
      where: { createdAt: { gte: hourAgo } },
    }),
    prisma.aIUsageEvent.aggregate({
      where: {
        createdAt: { gte: since30d },
      },
      _sum: { estimatedCostUsd: true },
      _count: { _all: true },
    }),
  ]);

  const estimatedAiCostUsd30d = Number(aiUsage30d._sum.estimatedCostUsd ?? 0);
  const aiUsageEvents30d = aiUsage30d._count._all;

  const criticalCount =
    (paymentWebhookFailed1h > 0 ? 1 : 0) +
    (notificationsFailed1h >= 5 ? 1 : 0) +
    (aiJobsFailed1h >= 3 ? 1 : 0);

  const warningCount =
    (notificationsFailed1h > 0 && notificationsFailed1h < 5 ? 1 : 0) +
    (aiJobsFailed1h > 0 && aiJobsFailed1h < 3 ? 1 : 0);

  const health: "HEALTHY" | "DEGRADED" | "CRITICAL" =
    criticalCount > 0 ? "CRITICAL" : warningCount > 0 ? "DEGRADED" : "HEALTHY";

  return {
    health,
    counters: {
      paymentWebhookFailed1h,
      paymentWebhookEvents1h,
      notificationsFailed1h,
      aiJobsFailed1h,
      estimatedAiCostUsd30d,
      aiUsageEvents30d,
    },
    thresholds: {
      paymentWebhookFailed1h: "CRITICAL > 0",
      notificationsFailed1h: "WARNING 1-4 / CRITICAL >=5",
      aiJobsFailed1h: "WARNING 1-2 / CRITICAL >=3",
    },
  };
}
