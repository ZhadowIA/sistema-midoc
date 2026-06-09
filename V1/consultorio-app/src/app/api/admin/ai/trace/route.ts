import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";

const querySchema = z.object({
  appointmentId: z.string().cuid(),
});

export async function GET(req: NextRequest) {
  try {
    const access = await requireMedicalDoctorApiAccess();
    if (access.response) return access.response;

    const parsed = querySchema.safeParse({
      appointmentId: req.nextUrl.searchParams.get("appointmentId"),
    });
    if (!parsed.success) {
      return jsonNoStore({ error: "Parámetros inválidos", details: parsed.error.issues }, { status: 400 });
    }

    const doctorId = access.context.doctorId;

    const [usageEvents, feedbackEvents] = await Promise.all([
      prisma.aIUsageEvent.findMany({
        where: { appointmentId: parsed.data.appointmentId, doctorId },
        select: {
          id: true,
          sourceModule: true,
          provider: true,
          model: true,
          promptVersion: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          estimatedCostUsd: true,
          durationMs: true,
          status: true,
          errorCode: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.aIInsightFeedback.findMany({
        where: { appointmentId: parsed.data.appointmentId, doctorId },
        select: {
          id: true,
          kind: true,
          action: true,
          originalText: true,
          editedText: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const totalCostUsd = usageEvents.reduce((sum, e) => {
      const v = e.estimatedCostUsd;
      const n = typeof v === "object" && v !== null && "toNumber" in v
        ? (v as { toNumber: () => number }).toNumber()
        : Number(v) || 0;
      return sum + n;
    }, 0);

    return jsonNoStore({
      appointmentId: parsed.data.appointmentId,
      summary: {
        totalCalls: usageEvents.length,
        totalCostUsd: Number(totalCostUsd.toFixed(6)),
        feedbackTotal: feedbackEvents.length,
      },
      usageEvents,
      feedbackEvents,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
