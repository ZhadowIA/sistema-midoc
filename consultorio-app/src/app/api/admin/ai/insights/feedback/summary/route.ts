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
});

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

    const feedbackEvents = await prisma.aIInsightFeedback.findMany({
      where: {
        doctorId: effectiveDoctorId,
        createdAt: { gte: from, lte: to },
      },
      select: {
        action: true,
        kind: true,
        createdAt: true,
      },
    });

    const totals = { total: feedbackEvents.length, applied: 0, edited: 0, rejected: 0, ignored: 0 };
    const byKind = {
      DIAGNOSIS: { total: 0, applied: 0, edited: 0, rejected: 0, ignored: 0 },
      TREATMENT: { total: 0, applied: 0, edited: 0, rejected: 0, ignored: 0 },
    };

    for (const row of feedbackEvents) {
      const kindKey = row.kind === "TREATMENT" ? "TREATMENT" : "DIAGNOSIS";
      byKind[kindKey].total += 1;
      if (row.action === "APPLIED") {
        totals.applied += 1;
        byKind[kindKey].applied += 1;
      } else if (row.action === "EDITED") {
        totals.edited += 1;
        byKind[kindKey].edited += 1;
      } else if (row.action === "REJECTED") {
        totals.rejected += 1;
        byKind[kindKey].rejected += 1;
      } else if (row.action === "IGNORED") {
        totals.ignored += 1;
        byKind[kindKey].ignored += 1;
      }
    }

    return jsonNoStore({
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        doctorId: effectiveDoctorId,
      },
      totals,
      byKind,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
