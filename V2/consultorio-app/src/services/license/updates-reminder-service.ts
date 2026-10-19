import { LicenseStatus, NotificationChannel, NotificationKind } from "@prisma/client";

import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { sendAccountNotification } from "../notifications/notification-service";

/**
 * Aviso por correo de que se acaban las actualizaciones incluidas en la
 * licencia (decision del 2026-10-18: lo que no impide usar la app va por
 * correo). La app sigue funcionando despues; el correo solo invita a renovar.
 * Sale dos veces, a 30 y a 7 dias, una sola vez cada una por fecha de fin.
 */

export const REMINDER_WINDOWS = [30, 7] as const;
export type ReminderWindow = (typeof REMINDER_WINDOWS)[number];

const DAY_MS = 86_400_000;

/** Ventana que toca avisar hoy, o null si faltan mas de 30 dias o ya termino. */
export function reminderWindow(updatesUntil: Date, now: Date): ReminderWindow | null {
  const daysLeft = Math.ceil((updatesUntil.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft < 0 || daysLeft > 30) return null;
  return daysLeft <= 7 ? 7 : 30;
}

export interface ReminderStats {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function sendUpdatesEndingReminders(now = new Date()): Promise<ReminderStats> {
  const stats: ReminderStats = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  const licenses = await prisma.license.findMany({
    where: {
      status: LicenseStatus.ACTIVE,
      updatesUntil: { gte: now, lte: new Date(now.getTime() + 31 * DAY_MS) }
    },
    select: {
      doctorId: true,
      updatesUntil: true,
      doctor: { select: { email: true, emailVerifiedAt: true } }
    }
  });

  for (const license of licenses) {
    stats.checked += 1;
    const window = reminderWindow(license.updatesUntil, now);
    // Sin correo verificado no se escribe a una direccion que nadie confirmo.
    if (!window || !license.doctor.emailVerifiedAt) {
      stats.skipped += 1;
      continue;
    }
    const updatesUntil = license.updatesUntil.toISOString();
    const already = await prisma.notification.findFirst({
      where: {
        doctorId: license.doctorId,
        kind: NotificationKind.LICENSE_UPDATES_ENDING,
        AND: [
          { metadata: { path: ["updatesUntil"], equals: updatesUntil } },
          { metadata: { path: ["window"], equals: window } }
        ]
      },
      select: { id: true }
    });
    if (already) {
      stats.skipped += 1;
      continue;
    }
    try {
      await sendAccountNotification({
        doctorId: license.doctorId,
        channel: NotificationChannel.EMAIL,
        kind: NotificationKind.LICENSE_UPDATES_ENDING,
        destination: license.doctor.email,
        actionUrl: `${env.APP_BASE_URL}/medico/cuenta`,
        template: { expiresAt: license.updatesUntil },
        metadata: { updatesUntil, window }
      });
      stats.sent += 1;
    } catch {
      stats.failed += 1;
    }
  }
  return stats;
}
