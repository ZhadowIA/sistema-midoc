import { AiCreditGrantKind, LicenseSource, LicenseStatus, UserRole, type License, type SyncDevice } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { addUtcMonths, toUtcCalendarDate } from "../../lib/dateTime";
import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { COURTESY_CREDITS, grantCredits } from "../ai/credit-ledger";
import {
  LICENSE_TOKEN_VERSION,
  signLicense,
  signingKeyFromSeed,
  type LicenseSigningKey
} from "../../lib/security/license-token";

/**
 * Licencia de compra unica y activacion por equipo (paso 29, rebanada 1).
 * OPERATIVO: gobernanza comercial, sin contenido clinico. La licencia firmada
 * que se entrega aqui es lo que la app verifica sin conexion; el portal solo
 * cuenta equipos y refresca la fecha de actualizaciones.
 */
export class LicenseServiceError extends ServiceError {}

/** Equipos por licencia mientras se decide el numero definitivo (15_modelo_de_negocio.md). */
export const DEFAULT_MAX_DEVICES = 2;
/** Meses de actualizaciones incluidas en la compra. */
export const INCLUDED_UPDATE_MONTHS = 12;

export interface LicenseActivationResult {
  /** Licencia firmada para guardar en el equipo. */
  license: string;
  updatesUntil: string;
  maxDevices: number;
  activeDevices: number;
}

/** Llave de firma del entorno, o null si este portal no emite licencias. */
export function configuredSigningKey(): LicenseSigningKey | null {
  if (!env.LICENSE_SIGNING_KEY || !env.LICENSE_SIGNING_KID) {
    return null;
  }
  return signingKeyFromSeed(env.LICENSE_SIGNING_KID, env.LICENSE_SIGNING_KEY);
}

/**
 * Otorga la licencia a una cuenta de medico. Sin pasarela de pago todavia
 * (paso 17), la otorga el administrador o la semilla de desarrollo/piloto.
 */
export async function grantLicense(input: {
  actorUserId: string | null;
  doctorUserId: string;
  source: LicenseSource;
  purchasedAt?: Date;
  maxDevices?: number;
}): Promise<License> {
  const maxDevices = input.maxDevices ?? DEFAULT_MAX_DEVICES;
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10) {
    throw new LicenseServiceError("Los equipos por licencia deben ser un entero entre 1 y 10.");
  }

  const doctor = await prisma.user.findFirst({
    where: { id: input.doctorUserId, role: UserRole.DOCTOR },
    select: { id: true, license: { select: { id: true } } }
  });
  if (!doctor) {
    throw new LicenseServiceError("Médico no encontrado.", 404);
  }
  if (doctor.license) {
    throw new LicenseServiceError("La cuenta ya tiene una licencia.", 409);
  }

  const purchasedAt = input.purchasedAt ?? new Date();
  // La compra incluye creditos de cortesia para probar la IA (15_modelo_de_negocio.md).
  const license = await prisma.$transaction(async (tx) => {
    const created = await tx.license.create({
      data: {
        doctorId: doctor.id,
        source: input.source,
        purchasedAt,
        updatesUntil: addUtcMonths(purchasedAt, INCLUDED_UPDATE_MONTHS),
        maxDevices
      }
    });
    await grantCredits({
      tx,
      doctorUserId: doctor.id,
      kind: AiCreditGrantKind.COURTESY,
      credits: COURTESY_CREDITS,
      note: "Cortesia de la licencia",
      actorUserId: input.actorUserId
    });
    return created;
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    entityType: "License",
    entityId: license.id,
    action: "license.granted",
    source: "license-service",
    metadata: { doctorUserId: doctor.id, source: input.source, maxDevices }
  });
  return license;
}

/**
 * Activa (o refresca) la licencia en el equipo vinculado. Idempotente por id de
 * instalacion: refrescar no ocupa otro lugar. Las activaciones de una misma
 * licencia se serializan con un candado de fila para que dos equipos a la vez
 * no rebasen el limite.
 */
export async function activateLicense(
  device: SyncDevice,
  input: { installationId: string; deviceName?: string },
  now = new Date()
): Promise<LicenseActivationResult> {
  const signingKey = configuredSigningKey();
  if (!signingKey) {
    throw new LicenseServiceError("Este portal todavía no emite licencias.", 503);
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const license = await tx.license.findUnique({ where: { doctorId: device.doctorId } });
    if (!license || license.status !== LicenseStatus.ACTIVE) {
      throw new LicenseServiceError("Tu cuenta no tiene una licencia activa de MiDoc.", 402);
    }
    await tx.$queryRaw`SELECT "id" FROM "License" WHERE "id" = ${license.id} FOR UPDATE`;

    const deviceName = input.deviceName?.trim() || device.deviceName || null;
    const existing = await tx.licenseActivation.findUnique({
      where: { licenseId_installationId: { licenseId: license.id, installationId: input.installationId } }
    });

    if (existing && !existing.releasedAt) {
      const activation = await tx.licenseActivation.update({
        where: { id: existing.id },
        data: { lastSeenAt: now, deviceName }
      });
      const activeDevices = await tx.licenseActivation.count({ where: { licenseId: license.id, releasedAt: null } });
      return { license, activation, activeDevices, newlyActivated: false };
    }

    const active = await tx.licenseActivation.count({ where: { licenseId: license.id, releasedAt: null } });
    if (active >= license.maxDevices) {
      throw new LicenseServiceError(
        `Tu licencia ya está activada en ${license.maxDevices} equipos. Libera uno desde tu cuenta MiDoc para activar este.`,
        409
      );
    }

    const activation = existing
      ? await tx.licenseActivation.update({
          where: { id: existing.id },
          data: { releasedAt: null, activatedAt: now, lastSeenAt: now, deviceName }
        })
      : await tx.licenseActivation.create({
          data: {
            licenseId: license.id,
            installationId: input.installationId,
            deviceName,
            activatedAt: now,
            lastSeenAt: now
          }
        });
    return { license, activation, activeDevices: active + 1, newlyActivated: true };
  });

  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: device.doctorId },
    select: { professionalName: true, licenseNumber: true }
  });

  const { license, activation, activeDevices, newlyActivated } = outcome;
  const updatesUntil = toUtcCalendarDate(license.updatesUntil);
  const token = signLicense(
    {
      v: LICENSE_TOKEN_VERSION,
      kid: signingKey.kid,
      licenseId: license.id,
      activationId: activation.id,
      accountId: device.doctorId,
      holderName: profile?.professionalName ?? null,
      holderLicenseNumber: profile?.licenseNumber ?? null,
      edition: license.edition,
      purchasedAt: toUtcCalendarDate(license.purchasedAt),
      updatesUntil,
      maxDevices: license.maxDevices,
      installationId: activation.installationId,
      issuedAt: now.toISOString()
    },
    signingKey
  );

  if (newlyActivated) {
    await writeAuditLog({
      actorUserId: device.doctorId,
      entityType: "License",
      entityId: license.id,
      action: "license.activated",
      source: "license-service",
      metadata: { activationId: activation.id, syncDeviceId: device.id, activeDevices }
    });
  }

  return { license: token, updatesUntil, maxDevices: license.maxDevices, activeDevices };
}

/**
 * Libera un equipo para activar otro. No apaga la licencia que ese equipo ya
 * tiene: la app funciona sin conexion aunque MiDoc deje de existir.
 */
export async function releaseActivation(doctorUserId: string, activationId: string, now = new Date()) {
  const activation = await prisma.licenseActivation.findFirst({
    where: { id: activationId, license: { doctorId: doctorUserId } }
  });
  if (!activation) {
    throw new LicenseServiceError("Equipo no encontrado.", 404);
  }
  if (activation.releasedAt) {
    return activation;
  }
  const released = await prisma.licenseActivation.update({
    where: { id: activation.id },
    data: { releasedAt: now }
  });
  await writeAuditLog({
    actorUserId: doctorUserId,
    entityType: "License",
    entityId: activation.licenseId,
    action: "license.device_released",
    source: "license-service",
    metadata: { activationId: activation.id }
  });
  return released;
}

/** Licencia y equipos activos de la cuenta, para la pagina "Cuenta". */
export async function getLicenseOverview(doctorUserId: string) {
  const license = await prisma.license.findUnique({
    where: { doctorId: doctorUserId },
    include: {
      activations: {
        where: { releasedAt: null },
        orderBy: { activatedAt: "asc" },
        select: { id: true, deviceName: true, activatedAt: true, lastSeenAt: true }
      }
    }
  });
  if (!license) {
    return { license: null };
  }
  return {
    license: {
      id: license.id,
      edition: license.edition,
      status: license.status,
      source: license.source,
      purchasedAt: toUtcCalendarDate(license.purchasedAt),
      updatesUntil: toUtcCalendarDate(license.updatesUntil),
      maxDevices: license.maxDevices,
      devices: license.activations
    }
  };
}
