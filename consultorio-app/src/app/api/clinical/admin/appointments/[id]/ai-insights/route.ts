import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { generateComprehensiveInsightsWithTelemetry } from "@/lib/aiNoteService";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { z } from "zod";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { formatPatientName } from "@/lib/patientName";
import { recordAiUsage, resolvePromptVersion } from "@/lib/aiTelemetry";
import { consumeAICredits, validateAICredits } from "@/lib/aiCreditsMiddleware";

const aiInsightsRequestSchema = z.object({
  soap: z
    .object({
      subjective: z.string().trim().max(12_000).optional(),
      objective: z.string().trim().max(12_000).optional(),
      assessment: z.string().trim().max(12_000).optional(),
      plan: z.string().trim().max(12_000).optional(),
      privateNotes: z.string().trim().max(12_000).optional(),
    })
    .optional(),
});

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = await checkRateLimit(req, {
      key: "admin:ai:insights:get",
      limit: 30,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const params = await props.params;
    const access = await requireMedicalDoctorApiAccess({ requiredFeature: "ai.insights" });
    if (access.response) return access.response;
    const doctorId = access.context.doctorId;

    const insight = await prisma.aIInsight.findFirst({
      where: { appointmentId: params.id, doctorId },
    });

    return jsonNoStore(insight || {});
  } catch (error: unknown) {
    console.error("AI Insights GET Error:", error);
    return jsonNoStore({ error: "No fue posible cargar los insights de IA." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  let doctorIdForTelemetry: string | null = null;
  let clinicIdForTelemetry: string | null = null;
  let appointmentIdForTelemetry: string | null = null;
  try {
    const rateLimit = await checkRateLimit(req, {
      key: "admin:ai:insights:post",
      limit: 12,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const params = await props.params;
    const access = await requireMedicalDoctorApiAccess({ requiredFeature: "ai.insights" });
    if (access.response) return access.response;
    const doctorId = access.context.doctorId;
    const actorUserId = access.context.user.id;
    doctorIdForTelemetry = doctorId;

    const creditCheck = await validateAICredits(actorUserId, "insights");
    if (!creditCheck.hasCredits) {
      return jsonNoStore({ error: creditCheck.error }, { status: 402 });
    }

    const body = await req.json().catch(() => ({}));
    const parsedBody = aiInsightsRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return jsonNoStore({ error: "Payload inválido", details: parsedBody.error.issues }, { status: 400 });
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      include: {
        questionnaire: true,
        patient: {
          include: {
            medicalRecord: true,
          },
        },
        doctor: {
          select: {
            name: true,
            specialty: true,
          },
        },
      },
    });

    if (!appointment) return jsonNoStore({ error: "No encontrado" }, { status: 404 });
    clinicIdForTelemetry = appointment.clinicId ?? null;
    appointmentIdForTelemetry = appointment.id;

    const context = {
      soap: parsedBody.data.soap,
      questionnaire: appointment.questionnaire,
      medicalRecord: appointment.patient?.medicalRecord,
      specialty: appointment.doctor?.specialty ?? null,
    };

    const { insights, usage } = await generateComprehensiveInsightsWithTelemetry(context, {
      patientName: appointment.patient ? formatPatientName(appointment.patient) : undefined,
      doctorName: appointment.doctor?.name,
    });

    await recordAiUsage({
      doctorId,
      clinicId: appointment.clinicId ?? null,
      appointmentId: appointment.id,
      sourceModule: "AI_INSIGHTS",
      provider: "OPENAI",
      model: usage.model,
      promptVersion: resolvePromptVersion("AI_INSIGHTS"),
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      durationMs: Date.now() - startedAt,
      status: "COMPLETED",
    });

    consumeAICredits(actorUserId, "insights", `Appointment ${appointment.id}: AI insights`).catch(() => {
      // no-op: usage was already recorded; credit drift is reconciled outside the request path
    });

    // Save or Update in DB
    const updated = await prisma.aIInsight.upsert({
      where: { appointmentId: params.id },
      update: {
        diagnoses: insights.diagnoses,
        treatments: insights.treatments,
        allowedFoods: insights.allowedFoods,
        forbiddenFoods: insights.forbiddenFoods,
      },
      create: {
        appointmentId: params.id,
        doctorId,
        diagnoses: insights.diagnoses,
        treatments: insights.treatments,
        allowedFoods: insights.allowedFoods,
        forbiddenFoods: insights.forbiddenFoods,
      },
    });

    return jsonNoStore(updated);
  } catch (error: unknown) {
    if (doctorIdForTelemetry) {
      await recordAiUsage({
        doctorId: doctorIdForTelemetry,
        clinicId: clinicIdForTelemetry,
        appointmentId: appointmentIdForTelemetry,
        sourceModule: "AI_INSIGHTS",
        provider: "OPENAI",
        model: "gpt-4o",
        promptVersion: resolvePromptVersion("AI_INSIGHTS"),
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs: Date.now() - startedAt,
        status: "FAILED",
        errorCode: "AI_INSIGHTS_FAILED",
        metadata: {
          message: error instanceof Error ? error.message : "unknown_error",
        },
      }).catch(() => {
        // no-op: telemetry failures should not mask endpoint errors
      });
    }
    console.error("AI Insights Error:", error);
    return jsonNoStore(
      { error: "No fue posible generar sugerencias clínicas con IA. Intenta nuevamente." },
      { status: 500 }
    );
  }
}
