import { AiCreditGrantKind, Prisma, UserRole } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

/**
 * Libro mayor de creditos de IA (paso 29, rebanada 3). OPERATIVO, sin
 * contenido clinico. Los creditos viven en el servidor: los abonos
 * (`AiCreditGrant`) guardan cuanto les queda y cada uso registra de que abonos
 * tomo (`AiCreditDebit`), para devolverlos si el proveedor falla. Se gastan
 * primero los que caducan (plan mensual), por fecha de caducidad, y despues
 * los que no caducan (cortesia, recargas, ajustes), del mas viejo al mas nuevo.
 */
export class CreditLedgerError extends ServiceError {}

/** Creditos de cortesia al otorgar la licencia (provisional hasta fijar precios). */
export const COURTESY_CREDITS = 30;

type Tx = Prisma.TransactionClient;

export interface CreditBalance {
  balance: number;
  /** Parte del saldo que caduca (plan mensual) y su caducidad mas proxima. */
  expiringCredits: number;
  nextExpiry: Date | null;
}

function vigente(now: Date): Prisma.AiCreditGrantWhereInput {
  return { remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export async function grantCredits(input: {
  doctorUserId: string;
  kind: AiCreditGrantKind;
  credits: number;
  expiresAt?: Date | null;
  note?: string;
  actorUserId: string | null;
  tx?: Tx;
}) {
  if (!Number.isInteger(input.credits) || input.credits < 1 || input.credits > 1_000_000) {
    throw new CreditLedgerError("Los créditos deben ser un entero entre 1 y 1,000,000.");
  }
  if (input.kind === AiCreditGrantKind.PLAN_MONTHLY && !input.expiresAt) {
    throw new CreditLedgerError("Los créditos del plan mensual necesitan fecha de caducidad.");
  }
  if (input.kind !== AiCreditGrantKind.PLAN_MONTHLY && input.expiresAt) {
    // Las recargas y la cortesia no caducan (15_modelo_de_negocio.md, PROFECO).
    throw new CreditLedgerError("Solo los créditos del plan mensual pueden caducar.");
  }
  const db = input.tx ?? prisma;
  const doctor = await db.user.findFirst({ where: { id: input.doctorUserId, role: UserRole.DOCTOR }, select: { id: true } });
  if (!doctor) {
    throw new CreditLedgerError("Médico no encontrado.", 404);
  }
  const grant = await db.aiCreditGrant.create({
    data: {
      doctorId: input.doctorUserId,
      kind: input.kind,
      credits: input.credits,
      remaining: input.credits,
      expiresAt: input.expiresAt ?? null,
      note: input.note?.trim() || null
    }
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    entityType: "AiCreditGrant",
    entityId: grant.id,
    action: "ai_credits.granted",
    source: "credit-ledger",
    metadata: { doctorUserId: input.doctorUserId, kind: input.kind, credits: input.credits }
  });
  return grant;
}

export async function getCreditBalance(doctorUserId: string, now = new Date(), tx?: Tx): Promise<CreditBalance> {
  const grants = await (tx ?? prisma).aiCreditGrant.findMany({
    where: { doctorId: doctorUserId, ...vigente(now) },
    select: { remaining: true, expiresAt: true }
  });
  const expiring = grants.filter((g) => g.expiresAt !== null);
  const nextExpiry = expiring.reduce<Date | null>(
    (soonest, g) => (soonest === null || g.expiresAt! < soonest ? g.expiresAt : soonest),
    null
  );
  return {
    balance: grants.reduce((sum, g) => sum + g.remaining, 0),
    expiringCredits: expiring.reduce((sum, g) => sum + g.remaining, 0),
    nextExpiry
  };
}

/**
 * Toma `credits` del saldo para un uso de IA, dentro de la transaccion de quien
 * llama. Bloquea los abonos vigentes de la cuenta para que dos usos a la vez no
 * gasten el mismo credito. Sin saldo suficiente lanza 402 y no toma nada.
 */
export async function debitCredits(
  tx: Tx,
  input: { doctorUserId: string; credits: number; aiUsageLogId: string; now?: Date }
) {
  const now = input.now ?? new Date();
  if (input.credits <= 0) {
    return;
  }
  // Orden de consumo: primero lo que caduca (antes lo que caduca antes), luego lo demas por antiguedad.
  const locked = await tx.$queryRaw<{ id: string; remaining: number }[]>`
    SELECT "id", "remaining" FROM "AiCreditGrant"
    WHERE "doctorId" = ${input.doctorUserId} AND "remaining" > 0
      AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
    ORDER BY ("expiresAt" IS NULL), "expiresAt", "createdAt", "id"
    FOR UPDATE`;

  const available = locked.reduce((sum, g) => sum + g.remaining, 0);
  if (available < input.credits) {
    throw new CreditLedgerError(
      `No tienes créditos de IA suficientes: esto cuesta ${input.credits} y tu saldo es ${available}. ` +
        "La transcripción local y el flujo manual siguen disponibles.",
      402
    );
  }

  let pending = input.credits;
  for (const grant of locked) {
    if (pending === 0) break;
    const take = Math.min(grant.remaining, pending);
    await tx.aiCreditGrant.update({ where: { id: grant.id }, data: { remaining: { decrement: take } } });
    await tx.aiCreditDebit.create({
      data: { doctorId: input.doctorUserId, grantId: grant.id, aiUsageLogId: input.aiUsageLogId, credits: take }
    });
    pending -= take;
  }
}

/** Devuelve a sus abonos lo que tomo un uso (proveedor fallido). Idempotente. */
export async function refundUsage(tx: Tx, aiUsageLogId: string) {
  const debits = await tx.aiCreditDebit.findMany({ where: { aiUsageLogId } });
  for (const debit of debits) {
    await tx.aiCreditGrant.update({ where: { id: debit.grantId }, data: { remaining: { increment: debit.credits } } });
  }
  await tx.aiCreditDebit.deleteMany({ where: { aiUsageLogId } });
}

export interface CreditMovement {
  /** Abono (`grant`) o consumo de un uso de IA (`usage`). */
  type: "grant" | "usage";
  /** Tipo de abono o de uso (TRANSCRIPTION, ...). Nunca contenido. */
  kind: string;
  /** Positivo si abona, negativo si consume. */
  credits: number;
  at: Date;
  expiresAt: Date | null;
}

/** Ultimos movimientos del saldo, del mas reciente al mas viejo, para la cuenta. */
export async function listCreditMovements(doctorUserId: string, limit = 20): Promise<CreditMovement[]> {
  const [grants, debits] = await Promise.all([
    prisma.aiCreditGrant.findMany({
      where: { doctorId: doctorUserId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { kind: true, credits: true, createdAt: true, expiresAt: true }
    }),
    prisma.aiCreditDebit.findMany({
      where: { doctorId: doctorUserId },
      orderBy: { createdAt: "desc" },
      take: limit * 4,
      select: { aiUsageLogId: true, credits: true, createdAt: true, aiUsageLog: { select: { usageType: true } } }
    })
  ]);

  // Un uso puede tomar de varios abonos: se muestra como un solo consumo.
  const usages = new Map<string, CreditMovement>();
  for (const debit of debits) {
    const current = usages.get(debit.aiUsageLogId);
    if (current) {
      current.credits -= debit.credits;
    } else {
      usages.set(debit.aiUsageLogId, {
        type: "usage",
        kind: debit.aiUsageLog.usageType,
        credits: -debit.credits,
        at: debit.createdAt,
        expiresAt: null
      });
    }
  }

  return [
    ...grants.map((g) => ({ type: "grant" as const, kind: g.kind, credits: g.credits, at: g.createdAt, expiresAt: g.expiresAt })),
    ...usages.values()
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}
