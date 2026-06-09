import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { AINoteGenerationService } from "@/services/AINoteGenerationService";
import { formatPatientName } from "@/lib/patientName";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";

const bodySchema = z.object({
  transcript: z.string().min(1).max(200_000),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimit = await checkRateLimit(req, {
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

    const encounter = await prisma.clinicalEncounter.findFirst({
      where: { id: params.id, doctorId },
      select: {
        id: true,
        patientId: true,
        appointmentId: true,
        clinicId: true,
        patient: { select: { id: true, firstName: true, lastNamePaternal: true, lastNameMaternal: true } },
        doctor: { select: { name: true } },
      },
    });
    if (!encounter) {
      return jsonNoStore({ error: "No encontrado" }, { status: 404 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonNoStore({ error: "Transcripción inválida" }, { status: 400 });
    }

    const job = await AINoteGenerationService.createJob({
      appointmentId: encounter.appointmentId ?? null,
      clinicalEncounterId: encounter.id,
      doctorId,
      patientId: encounter.patientId,
      clinicId: encounter.clinicId ?? null,
      actorUserId,
      ipAddress: getRequestIp(req),
      userAgent: getUserAgent(req),
    });

    void AINoteGenerationService.processTranscriptJob({
      jobId: job.id,
      appointmentId: encounter.appointmentId ?? null,
      clinicalEncounterId: encounter.id,
      doctorId,
      patientId: encounter.patientId,
      clinicId: encounter.clinicId ?? null,
      actorUserId,
      ipAddress: getRequestIp(req),
      userAgent: getUserAgent(req),
      transcript: parsed.data.transcript,
      patientName: formatPatientName(encounter.patient),
      doctorName: encounter.doctor.name,
    });

    return jsonNoStore(
      { jobId: job.id, status: job.status, progressPct: job.progressPct, statusMessage: job.statusMessage },
      { status: 202 },
    );
  } catch (error: unknown) {
    console.error("AI Generation from transcript (encounter) error:", error);
    return jsonNoStore({ error: "No fue posible generar la nota. Intenta nuevamente." }, { status: 500 });
  }
}
