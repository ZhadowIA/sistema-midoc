import prisma from "@/lib/prisma";

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

export async function getTwoFactorOverview() {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [adminUsers, credentials, recentEvents] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "CLINIC_ADMIN"] },
        active: true,
      },
      select: { id: true, role: true, email: true },
    }),
    prisma.$queryRaw<Array<{ userId: string; enabled: boolean; recoveryCodes: unknown }>>`
      SELECT "userId", "enabled", "recoveryCodes"
      FROM "TwoFactorCredential"
    `,
    prisma.auditLog.findMany({
      where: {
        createdAt: { gte: since },
        action: {
          in: [
            "auth.login.2fa_failed",
            "auth.login.2fa_verified",
            "auth.login.2fa_recovery_code_used",
            "security.2fa.enabled",
            "security.2fa.disabled",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        createdAt: true,
        metadata: true,
      },
    }),
  ]);

  const credentialsByUserId = new Map(credentials.map((row) => [row.userId, row]));

  const totalAdmins = adminUsers.length;
  const enabledAdmins = adminUsers.filter((user) => credentialsByUserId.get(user.id)?.enabled === true).length;
  const missingSetupAdmins = totalAdmins - enabledAdmins;
  const withoutRecoveryCodes = adminUsers.filter((user) => {
    const row = credentialsByUserId.get(user.id);
    if (!row?.enabled) return false;
    return !Array.isArray(row.recoveryCodes) || row.recoveryCodes.length === 0;
  }).length;

  const failed2faAttempts30d = recentEvents.filter((event) => event.action === "auth.login.2fa_failed").length;
  const recoveryCodeUsage30d = recentEvents.filter((event) => event.action === "auth.login.2fa_recovery_code_used").length;
  const enabledChanges30d = recentEvents.filter((event) => event.action === "security.2fa.enabled").length;
  const disabledChanges30d = recentEvents.filter((event) => event.action === "security.2fa.disabled").length;

  return {
    totals: {
      totalAdmins,
      enabledAdmins,
      missingSetupAdmins,
      withoutRecoveryCodes,
      failed2faAttempts30d,
      recoveryCodeUsage30d,
      enabledChanges30d,
      disabledChanges30d,
    },
    recentEvents: recentEvents.slice(0, 15).map((event) => ({
      id: event.id,
      actorUserId: event.actorUserId,
      action: event.action,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
