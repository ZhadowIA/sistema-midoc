import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { can, PERMISSIONS } from "@/lib/permissions";

const querySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  doctorId: z.string().cuid().optional(),
  module: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(120).optional(),
});

type SummaryItem = {
  key: string;
  jobs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function aggregateItems<T extends { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: unknown }>(
  rows: T[],
  keyGetter: (row: T) => string,
): SummaryItem[] {
  const map = new Map<string, SummaryItem>();
  for (const row of rows) {
    const key = keyGetter(row);
    const current = map.get(key) ?? {
      key,
      jobs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
    current.jobs += 1;
    current.inputTokens += row.inputTokens;
    current.outputTokens += row.outputTokens;
    current.totalTokens += row.totalTokens;
    current.estimatedCostUsd += toNumber(row.estimatedCostUsd);
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireMedicalDoctorApiAccess();
    if (access.response) return access.response;
    const authUser = access.context.user;

    if (!can(authUser, PERMISSIONS.BILLING_READ)) {
      return jsonNoStore({ error: "No autorizado" }, { status: 403 });
    }

    const parsedQuery = querySchema.safeParse({
      from: req.nextUrl.searchParams.get("from"),
      to: req.nextUrl.searchParams.get("to"),
      doctorId: req.nextUrl.searchParams.get("doctorId") ?? undefined,
      module: req.nextUrl.searchParams.get("module") ?? undefined,
      model: req.nextUrl.searchParams.get("model") ?? undefined,
    });
    if (!parsedQuery.success) {
      return jsonNoStore({ error: "Parámetros inválidos", details: parsedQuery.error.issues }, { status: 400 });
    }

    const from = new Date(parsedQuery.data.from);
    const to = new Date(parsedQuery.data.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return jsonNoStore({ error: "Rango de fechas inválido" }, { status: 400 });
    }

    const canManageBilling = can(authUser, PERMISSIONS.BILLING_MANAGE);
    const effectiveDoctorId =
      canManageBilling && parsedQuery.data.doctorId
        ? parsedQuery.data.doctorId
        : access.context.doctorId;

    const where = {
      doctorId: effectiveDoctorId,
      createdAt: {
        gte: from,
        lte: to,
      },
      ...(parsedQuery.data.module ? { sourceModule: parsedQuery.data.module } : {}),
      ...(parsedQuery.data.model ? { model: parsedQuery.data.model } : {}),
    };

    const [events, doctorUser] = await Promise.all([
      prisma.aIUsageEvent.findMany({
        where,
        select: {
          createdAt: true,
          sourceModule: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          estimatedCostUsd: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.findUnique({
        where: { id: effectiveDoctorId },
        select: { specialty: true },
      }),
    ]);

    const totals = events.reduce(
      (acc, row) => {
        acc.jobs += 1;
        acc.inputTokens += row.inputTokens;
        acc.outputTokens += row.outputTokens;
        acc.totalTokens += row.totalTokens;
        acc.estimatedCostUsd += toNumber(row.estimatedCostUsd);
        return acc;
      },
      { jobs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    );

    const byModule = aggregateItems(events, (row) => row.sourceModule).map((item) => ({
      module: item.key,
      ...item,
    }));

    const byModel = aggregateItems(events, (row) => row.model).map((item) => ({
      model: item.key,
      ...item,
    }));

    const dailyMap = new Map<string, Omit<SummaryItem, "key">>();
    for (const row of events) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const current = dailyMap.get(date) ?? {
        jobs: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      };
      current.jobs += 1;
      current.inputTokens += row.inputTokens;
      current.outputTokens += row.outputTokens;
      current.totalTokens += row.totalTokens;
      current.estimatedCostUsd += toNumber(row.estimatedCostUsd);
      dailyMap.set(date, current);
    }

    const dailySeries = Array.from(dailyMap.entries()).map(([date, stats]) => ({ date, ...stats }));

    const specialty = doctorUser?.specialty ?? null;
    const bySpecialty = specialty
      ? [{ specialty, ...totals }]
      : [];

    return jsonNoStore({
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        doctorId: effectiveDoctorId,
        module: parsedQuery.data.module ?? null,
        model: parsedQuery.data.model ?? null,
      },
      totals,
      byModule,
      byModel,
      bySpecialty,
      dailySeries,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

