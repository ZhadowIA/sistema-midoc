import {
  SubscriptionStatus,
  UserRole,
  type DoctorSubscription,
  type SubscriptionPlan
} from "@prisma/client";

import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

/**
 * OPERATIVO, CONGELADO desde el paso 29: la suscripcion se sustituyo por la
 * licencia de compra unica y los creditos de IA (`services/license`,
 * `services/ai/credit-ledger.ts`). Solo queda la resolucion de capacidades que
 * usan los modulos congelados (agenda, notificaciones) cuando
 * MIDOC_FROZEN_SCOPE se enciende; el ciclo de vida y sus rutas se retiraron.
 * Las tablas se conservan (congelar no es borrar).
 */
export class SubscriptionServiceError extends ServiceError {}

/**
 * Catalogo de capacidades que un plan puede habilitar. El gating por capacidad
 * (`require-capability.ts`) y la app del medico consultan estas claves.
 */
export const CAPABILITIES = [
  "agenda", // agenda publica y holds
  "documents", // buzon de documentos y resumenes autorizados
  "notifications", // SMS y correo transaccional
  "ai", // IA clinica gobernada
  "presential" // operacion presencial (recepcion, caja)
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type CapabilityMap = Record<Capability, boolean>;

/** Alias de claves heredadas hacia el catalogo actual, para planes antiguos. */
const LEGACY_CAPABILITY_ALIASES: Record<string, Capability> = {
  scheduling: "agenda",
  sms: "notifications",
  email: "notifications"
};

/** Estados que dan derecho a las capacidades del plan. */
const ENTITLED_STATUSES = [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE] as const;

function emptyCapabilities(): CapabilityMap {
  return CAPABILITIES.reduce((acc, cap) => {
    acc[cap] = false;
    return acc;
  }, {} as CapabilityMap);
}

/** Lee un JSON de capacidades (plan o parche) tolerando claves heredadas y desconocidas. */
function readCapabilityMap(source: unknown): Partial<CapabilityMap> {
  if (!source || typeof source !== "object") {
    return {};
  }

  const record = source as Record<string, unknown>;
  const out: Partial<CapabilityMap> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "boolean") {
      continue;
    }

    const canonical = (CAPABILITIES as readonly string[]).includes(key)
      ? (key as Capability)
      : LEGACY_CAPABILITY_ALIASES[key];

    if (canonical) {
      // Una capacidad habilitada por cualquier alias gana.
      out[canonical] = out[canonical] === true ? true : value;
    }
  }

  return out;
}

type SubscriptionWithPlan = DoctorSubscription & { plan: SubscriptionPlan };

async function resolveDoctorProfileId(userId: string): Promise<string> {
  const doctor = await prisma.user.findUnique({
    where: { id: userId },
    include: { doctorProfile: { select: { id: true } } }
  });

  if (!doctor || doctor.role !== UserRole.DOCTOR || !doctor.doctorProfile) {
    throw new SubscriptionServiceError("Cuenta de medico no encontrada.", 404);
  }

  return doctor.doctorProfile.id;
}

/**
 * Ultima suscripcion del medico, sin importar su estado, para reflejar la realidad
 * (incluido CANCELLED) en la UI. El derecho a capacidades se deriva del estado.
 */
async function getLatestSubscription(
  doctorProfileId: string
): Promise<SubscriptionWithPlan | null> {
  return prisma.doctorSubscription.findFirst({
    where: { doctorProfileId },
    include: { plan: true },
    orderBy: { createdAt: "desc" }
  });
}

export interface ResolvedSubscription {
  subscription: SubscriptionWithPlan | null;
  status: SubscriptionStatus | null;
  planCode: string | null;
  /** El estado da derecho a usar las capacidades del plan. */
  entitled: boolean;
  /** Capacidades efectivas: vacias si no hay suscripcion con derecho. */
  capabilities: CapabilityMap;
}

/**
 * Resuelve las capacidades efectivas del medico: capacidades del plan, parchadas
 * por la suscripcion, y solo si el estado da derecho. Sin suscripcion vigente con
 * derecho => todas las capacidades en false (todo gateado).
 */
export async function resolveDoctorCapabilities(userId: string): Promise<ResolvedSubscription> {
  const doctorProfileId = await resolveDoctorProfileId(userId);
  const subscription = await getLatestSubscription(doctorProfileId);

  if (!subscription) {
    return {
      subscription: null,
      status: null,
      planCode: null,
      entitled: false,
      capabilities: emptyCapabilities()
    };
  }

  const entitled = (ENTITLED_STATUSES as readonly SubscriptionStatus[]).includes(
    subscription.status
  );

  const capabilities = emptyCapabilities();

  if (entitled) {
    Object.assign(
      capabilities,
      readCapabilityMap(subscription.plan.capabilities),
      readCapabilityMap(subscription.capabilitiesPatch)
    );
  }

  return {
    subscription,
    status: subscription.status,
    planCode: subscription.plan.code,
    entitled,
    capabilities
  };
}
