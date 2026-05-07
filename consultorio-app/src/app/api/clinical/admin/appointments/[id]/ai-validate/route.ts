import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { validatePrescriptionWithTelemetry } from "@/lib/aiNoteService";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { z } from "zod";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { formatPatientName } from "@/lib/patientName";
import { recordAiUsage, resolvePromptVersion } from "@/lib/aiTelemetry";
import { consumeAICredits, validateAICredits } from "@/lib/aiCreditsMiddleware";

const prescriptionSchema = z.object({
  medication: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(200).optional().default(""),
  frequency: z.string().trim().max(200).optional().default(""),
  duration: z.string().trim().max(200).optional().default(""),
  instructions: z.string().trim().max(1000).optional().default(""),
});

const aiValidateRequestSchema = z.object({
  prescriptions: z.array(prescriptionSchema).max(50),
});

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
      key: "admin:ai:validate:post",
      limit: 20,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const params = await props.params;
    const access = await requireMedicalDoctorApiAccess({ requiredFeature: "ai.insights" });
    if (access.response) return access.response;
    const doctorId = access.context.doctorId;
    const actorUserId = access.context.user.id;
    doctorIdForTelemetry = doctorId;

    const creditCheck = await validateAICredits(actorUserId, "pharmacovigilance");
    if (!creditCheck.hasCredits) {
      return jsonNoStore({ error: creditCheck.error }, { status: 402 });
    }

    const body = await req.json().catch(() => ({}));
    const parsedBody = aiValidateRequestSchema.safeParse(body);
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
          },
        },
      },
    });

    if (!appointment) return jsonNoStore({ error: "No encontrado" }, { status: 404 });
    clinicIdForTelemetry = appointment.clinicId ?? null;
    appointmentIdForTelemetry = appointment.id;

    const { alerts, usage } = await validatePrescriptionWithTelemetry({
      prescriptions: parsedBody.data.prescriptions,
      medicalRecord: appointment.patient?.medicalRecord,
      questionnaire: appointment.questionnaire,
    }, {
      patientName: appointment.patient ? formatPatientName(appointment.patient) : undefined,
      doctorName: appointment.doctor?.name,
    });

    await recordAiUsage({
      doctorId,
      clinicId: appointment.clinicId ?? null,
      appointmentId: appointment.id,
      sourceModule: "AI_PRESCRIPTION_VALIDATE",
      provider: "OPENAI",
      model: usage.model,
      promptVersion: resolvePromptVersion("AI_PRESCRIPTION_VALIDATE"),
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      durationMs: Date.now() - startedAt,
      status: "COMPLETED",
    });

    consumeAICredits(
      actorUserId,
      "pharmacovigilance",
      `Appointment ${appointment.id}: prescription validation`
    ).catch(() => {
      // no-op: usage was already recorded; credit drift is reconciled outside the request path
    });

    return jsonNoStore({ alerts });
  } catch (error: unknown) {
    if (doctorIdForTelemetry) {
      await recordAiUsage({
        doctorId: doctorIdForTelemetry,
        clinicId: clinicIdForTelemetry,
        appointmentId: appointmentIdForTelemetry,
        sourceModule: "AI_PRESCRIPTION_VALIDATE",
        provider: "OPENAI",
        model: "gpt-4o",
        promptVersion: resolvePromptVersion("AI_PRESCRIPTION_VALIDATE"),
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs: Date.now() - startedAt,
        status: "FAILED",
        errorCode: "AI_VALIDATE_FAILED",
        metadata: {
          message: error instanceof Error ? error.message : "unknown_error",
        },
      }).catch(() => {
        // no-op: telemetry failures should not mask endpoint errors
      });
    }
    console.error("AI Validation Error:", error);
    return jsonNoStore(
      { error: "No fue posible validar la receta con IA en este momento." },
      { status: 500 }
    );
  }
}
