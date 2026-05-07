import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { z } from "zod";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";
import { AINoteGenerationService } from "@/services/AINoteGenerationService";
import { ConsentCaptureService } from "@/services/ConsentCaptureService";
import { formatPatientName } from "@/lib/patientName";
import { withEndpointObservability } from "@/lib/observability";
import { validateAICredits } from "@/lib/aiCreditsMiddleware";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const allowedAudioTypes = new Set([
  "audio/webm",
  "video/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
]);

const aiGenerateQuerySchema = z.object({
  maxBytes: z.coerce.number().int().min(1).max(50 * 1024 * 1024).optional(),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  return withEndpointObservability({ endpoint: "api.ai.note.generate", method: "POST" }, async () => {
    try {
      const rateLimit = await checkRateLimit(req, {
        key: "admin:ai:note:generate",
        limit: 15,
        windowMs: 15 * 60_000,
      });
      if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const access = await requireMedicalDoctorApiAccess({ requiredFeature: "ai.dictation" });
    if (access.response) return access.response;

    const doctorUserId = access.context.user.id;
    const creditCheck = await validateAICredits(doctorUserId, "dictation");
    if (!creditCheck.hasCredits) {
      return jsonNoStore({ error: creditCheck.error }, { status: 402 });
    }

    const params = await props.params;
    const doctorId = access.context.doctorId;
    const actorUserId = access.context.user.id;
    const ipAddress = getRequestIp(req);
    const userAgent = getUserAgent(req);

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
          },
        },
        doctor: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!appointment) {
      return jsonNoStore({ error: "No encontrado" }, { status: 404 });
    }

    const formData = await req.formData();
    const audioEntry = formData.get("audio");
    if (!(audioEntry instanceof Blob)) {
      return jsonNoStore({ error: "Archivo de audio no encontrado" }, { status: 400 });
    }

    const url = new URL(req.url);
    const parsedQuery = aiGenerateQuerySchema.safeParse({
      maxBytes: url.searchParams.get("maxBytes") ?? undefined,
    });
    if (!parsedQuery.success) {
      return jsonNoStore({ error: "Parámetros inválidos" }, { status: 400 });
    }

    const audioFile = audioEntry;
    const effectiveMaxBytes = parsedQuery.data.maxBytes ?? MAX_AUDIO_BYTES;
    const mimeType = (audioFile.type || "").toLowerCase().split(";")[0].trim();
    if (!allowedAudioTypes.has(mimeType)) {
      return jsonNoStore(
        { error: "Formato de audio no permitido. Usa WebM, OGG, MP3, MP4 o WAV." },
        { status: 400 }
      );
    }

    if (audioFile.size <= 0) {
      return jsonNoStore({ error: "El archivo de audio está vacío." }, { status: 400 });
    }

    if (audioFile.size > effectiveMaxBytes) {
      return jsonNoStore(
        { error: `El audio excede el tamaño máximo permitido (${Math.round(effectiveMaxBytes / 1024 / 1024)}MB).` },
        { status: 413 }
      );
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
        metadata: {
          source: "recording_button_fallback",
        },
      });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const fileName = audioEntry instanceof File ? audioEntry.name : "audio";

    const job = await AINoteGenerationService.createJob({
      appointmentId: appointment.id,
      doctorId,
      patientId: appointment.patientId,
      actorUserId,
      ipAddress,
      userAgent,
    });

    void AINoteGenerationService.processJob({
      jobId: job.id,
      appointmentId: appointment.id,
      doctorId,
      patientId: appointment.patientId,
      clinicId: appointment.clinicId ?? null,
      actorUserId,
      ipAddress,
      userAgent,
      audioBuffer: buffer,
      mimeType,
      fileName,
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
        { status: 202 }
      );
    } catch (error: unknown) {
      console.error("AI Generation Error:", error);
      return jsonNoStore(
        { error: "No fue posible generar la nota con IA. Intenta nuevamente en unos minutos." },
        { status: 500 }
      );
    }
  });
}
