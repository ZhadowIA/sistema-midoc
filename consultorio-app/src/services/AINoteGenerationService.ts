import prisma from "@/lib/prisma";
import { generateDictationFromTranscript, transcribeAudio } from "@/lib/aiNoteService";
import { AppointmentAuditService } from "./AppointmentAuditService";

const MIN_TRANSCRIPT_WORDS = 12;
const MIN_TRANSCRIPT_CHARS = 60;

export type TranscriptQualityResult =
  | { ok: true; normalized: string; words: number; chars: number }
  | { ok: false; reason: string; words: number; chars: number };

export function validateTranscriptQuality(transcript: string): TranscriptQualityResult {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  const chars = normalized.length;
  const words = normalized ? normalized.split(" ").filter(Boolean).length : 0;
  if (chars < MIN_TRANSCRIPT_CHARS || words < MIN_TRANSCRIPT_WORDS) {
    return {
      ok: false,
      reason:
        "Transcripción insuficiente para generar una nota clínica confiable. Continúa la narración y vuelve a intentar.",
      words,
      chars,
    };
  }
  return { ok: true, normalized, words, chars };
}

async function loadClinicalContext(appointmentId: string, patientId: string) {
  const [clinicalHistory, encounterHistory, questionnaire] = await Promise.all([
    prisma.clinicalHistory.findUnique({
      where: { patientId },
      select: { payload: true, completionPct: true, status: true },
    }),
    prisma.encounterHistory.findUnique({
      where: { appointmentId },
      select: { payload: true, completionPct: true, status: true },
    }),
    prisma.questionnaire.findUnique({
      where: { appointmentId },
      select: { primarySymptom: true, responses: true },
    }),
  ]);

  const context: {
    clinicalHistory?: unknown;
    encounterHistory?: unknown;
    questionnaire?: unknown;
  } = {};
  if (clinicalHistory) context.clinicalHistory = clinicalHistory;
  if (encounterHistory) context.encounterHistory = encounterHistory;
  if (questionnaire) context.questionnaire = questionnaire;
  return Object.keys(context).length > 0 ? context : undefined;
}

type CreateJobInput = {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  actorUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type ProcessJobInput = CreateJobInput & {
  jobId: string;
  audioBuffer: Buffer;
  mimeType: string;
  fileName?: string;
  patientName?: string | null;
  doctorName?: string | null;
};

type ProcessTranscriptJobInput = CreateJobInput & {
  jobId: string;
  transcript: string;
  patientName?: string | null;
  doctorName?: string | null;
};

export class AINoteGenerationService {
  static async createJob(input: CreateJobInput) {
    const job = await prisma.aIProcessingJob.create({
      data: {
        appointmentId: input.appointmentId,
        doctorId: input.doctorId,
        kind: "SOAP_NOTE_GENERATION",
        status: "QUEUED",
        progressPct: 5,
        statusMessage: "Audio recibido",
      },
    });

    await AppointmentAuditService.safeLog({
      doctorId: input.doctorId,
      appointmentId: input.appointmentId,
      patientId: input.patientId,
      actorType: "DOCTOR",
      actorUserId: input.actorUserId,
      source: "ADMIN_PANEL",
      action: "AI_NOTE_GENERATION_REQUESTED",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        jobId: job.id,
      },
    });

    return job;
  }

  static async processJob(input: ProcessJobInput) {
    const startedAtMs = Date.now();
    try {
      await prisma.aIProcessingJob.update({
        where: { id: input.jobId },
        data: {
          status: "PROCESSING",
          progressPct: 25,
          statusMessage: "Transcribiendo audio",
        },
      });

      const transcript = await transcribeAudio({
        audioBuffer: input.audioBuffer,
        mimeType: input.mimeType,
        fileName: input.fileName,
      });
      const quality = validateTranscriptQuality(transcript);
      if (!quality.ok) {
        throw new Error(quality.reason);
      }

      await prisma.aIProcessingJob.update({
        where: { id: input.jobId },
        data: {
          progressPct: 65,
          statusMessage: "Generando nota SOAP",
        },
      });

      const clinicalContext = await loadClinicalContext(input.appointmentId, input.patientId);

      const { soap, encounter } = await generateDictationFromTranscript(
        quality.normalized,
        {
          patientName: input.patientName,
          doctorName: input.doctorName,
        },
        clinicalContext
      );

      await prisma.$transaction(async (tx) => {
        await tx.clinicalNote.upsert({
          where: { appointmentId: input.appointmentId },
          update: {
            subjective: soap.subjective,
            objective: soap.objective,
            assessment: soap.assessment,
            plan: soap.plan,
            soapPayload: soap,
          },
          create: {
            appointmentId: input.appointmentId,
            doctorId: input.doctorId,
            patientId: input.patientId,
            subjective: soap.subjective,
            objective: soap.objective,
            assessment: soap.assessment,
            plan: soap.plan,
            soapPayload: soap,
          },
        });

        await tx.aIProcessingJob.update({
          where: { id: input.jobId },
          data: {
            status: "COMPLETED",
            progressPct: 100,
            statusMessage: "Nota lista para revisión",
            resultPayload: {
              soap,
              encounter,
              meta: {
                source: "audio_upload",
                audioBytes: input.audioBuffer.byteLength,
                mimeType: input.mimeType,
                transcriptWords: quality.words,
                transcriptChars: quality.chars,
              },
            },
            finishedAt: new Date(),
          },
        });
      });

      await AppointmentAuditService.safeLog({
        doctorId: input.doctorId,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        actorType: "DOCTOR",
        actorUserId: input.actorUserId,
        source: "ADMIN_PANEL",
        action: "AI_NOTE_GENERATION_COMPLETED",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          jobId: input.jobId,
          durationMs: Date.now() - startedAtMs,
          mode: "audio_upload",
          audioBytes: input.audioBuffer.byteLength,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No fue posible completar la generación automática de la nota.";

      await prisma.aIProcessingJob.update({
        where: { id: input.jobId },
        data: {
          status: "FAILED",
          progressPct: 100,
          statusMessage: "Falló la generación",
          errorMessage: message,
          resultPayload: {
            meta: {
              source: "audio_upload",
              audioBytes: input.audioBuffer.byteLength,
              mimeType: input.mimeType,
            },
          },
          finishedAt: new Date(),
        },
      });

      await AppointmentAuditService.safeLog({
        doctorId: input.doctorId,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        actorType: "DOCTOR",
        actorUserId: input.actorUserId,
        source: "ADMIN_PANEL",
        action: "AI_NOTE_GENERATION_FAILED",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          jobId: input.jobId,
          error: message,
          durationMs: Date.now() - startedAtMs,
          mode: "audio_upload",
          audioBytes: input.audioBuffer.byteLength,
        },
      });
    }
  }

  static async processTranscriptJob(input: ProcessTranscriptJobInput) {
    const startedAtMs = Date.now();
    try {
      await prisma.aIProcessingJob.update({
        where: { id: input.jobId },
        data: {
          status: "PROCESSING",
          progressPct: 60,
          statusMessage: "Estructurando nota SOAP",
        },
      });

      const clinicalContext = await loadClinicalContext(input.appointmentId, input.patientId);
      const quality = validateTranscriptQuality(input.transcript);
      if (!quality.ok) {
        throw new Error(quality.reason);
      }

      const { soap, encounter } = await generateDictationFromTranscript(
        quality.normalized,
        {
          patientName: input.patientName,
          doctorName: input.doctorName,
        },
        clinicalContext,
      );

      await prisma.$transaction(async (tx) => {
        await tx.clinicalNote.upsert({
          where: { appointmentId: input.appointmentId },
          update: {
            subjective: soap.subjective,
            objective: soap.objective,
            assessment: soap.assessment,
            plan: soap.plan,
            soapPayload: soap,
          },
          create: {
            appointmentId: input.appointmentId,
            doctorId: input.doctorId,
            patientId: input.patientId,
            subjective: soap.subjective,
            objective: soap.objective,
            assessment: soap.assessment,
            plan: soap.plan,
            soapPayload: soap,
          },
        });

        await tx.aIProcessingJob.update({
          where: { id: input.jobId },
          data: {
            status: "COMPLETED",
            progressPct: 100,
            statusMessage: "Nota lista para revisión",
            resultPayload: {
              soap,
              encounter,
              meta: {
                source: "deepgram_stream",
                transcriptChars: quality.chars,
                transcriptWords: quality.words,
              },
            },
            finishedAt: new Date(),
          },
        });
      });

      await AppointmentAuditService.safeLog({
        doctorId: input.doctorId,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        actorType: "DOCTOR",
        actorUserId: input.actorUserId,
        source: "ADMIN_PANEL",
        action: "AI_NOTE_GENERATION_COMPLETED",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          jobId: input.jobId,
          mode: "deepgram_stream",
          transcriptChars: input.transcript.length,
          durationMs: Date.now() - startedAtMs,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No fue posible completar la generación automática de la nota.";

      await prisma.aIProcessingJob.update({
        where: { id: input.jobId },
        data: {
          status: "FAILED",
          progressPct: 100,
          statusMessage: "Falló la generación",
          errorMessage: message,
          resultPayload: {
            meta: {
              source: "deepgram_stream",
              transcriptChars: input.transcript.length,
            },
          },
          finishedAt: new Date(),
        },
      });

      await AppointmentAuditService.safeLog({
        doctorId: input.doctorId,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        actorType: "DOCTOR",
        actorUserId: input.actorUserId,
        source: "ADMIN_PANEL",
        action: "AI_NOTE_GENERATION_FAILED",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          jobId: input.jobId,
          error: message,
          mode: "deepgram_stream",
          transcriptChars: input.transcript.length,
          durationMs: Date.now() - startedAtMs,
        },
      });
    }
  }
}
