import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";
import { AINoteGenerationService } from "@/services/AINoteGenerationService";
import { ConsentCaptureService } from "@/services/ConsentCaptureService";
import { formatPatientName } from "@/lib/patientName";

const bodySchema = z.object({
  transcript: z.string().min(1).max(200_000),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimit = checkRateLimit(req, {
      key: "admin:ai:note:generate-from-transcript",
      limit: 15,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const access = await requireMedicalDoctorApiAccess({ requiredFeature: "ai.dictation" });
    if (access.response) return access.response;

    const params = await props.params;
    const doctorId = access.context.doctorId;
    const actorUserId = access.context.user.id;
    const ipAddress = getRequestIp(req);
    const userAgent = getUserAgent(req);

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      include: {
        patient: { select: { id: true, firstName: true, lastNamePaternal: true, lastNameMaternal: true } },
        doctor: { select: { name: true } },
      },
    });
    if (!appointment) {
      return jsonNoStore({ error: "No encontrado" }, { status: 404 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonNoStore({ error: "Transcripción inválida" }, { status: 400 });
    }

    const lastVerbalConsent = await prisma.consentCapture.findFirst({
      where: {
        appointmentId: params.id,
        type: "VERBAL_RECORDING_CONFIRMATION",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!lastVerbalConsent) {
      await ConsentCaptureService.capture({
        appointmentId: appointment.id,
        doctorId,
        patientId: appointment.patientId,
        capturedByUserId: actorUserId,
        type: "VERBAL_RECORDING_CONFIRMATION",
        ipAddress,
        userAgent,
        metadata: { source: "deepgram_stream_fallback" },
      });
    }

    const job = await AINoteGenerationService.createJob({
      appointmentId: appointment.id,
      doctorId,
      patientId: appointment.patientId,
      actorUserId,
      ipAddress,
      userAgent,
    });

    void AINoteGenerationService.processTranscriptJob({
      jobId: job.id,
      appointmentId: appointment.id,
      doctorId,
      patientId: appointment.patientId,
      actorUserId,
      ipAddress,
      userAgent,
      transcript: parsed.data.transcript,
      patientName: formatPatientName(appointment.patient),
      doctorName: appointment.doctor.name,
    });

    return jsonNoStore(
      {
        jobId: job.id,
        status: job.status,
        progressPct: job.progressPct,
        statusMessage: job.statusMessage,
      },
      { status: 202 },
    );
  } catch (error: unknown) {
    console.error("AI Generation from transcript error:", error);
    return jsonNoStore(
      { error: "No fue posible generar la nota. Intenta nuevamente." },
      { status: 500 },
    );
  }
}
