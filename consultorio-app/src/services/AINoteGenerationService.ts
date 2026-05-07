import prisma from "@/lib/prisma";
import { generateDictationFromTranscriptWithTelemetry, transcribeAudio } from "@/lib/aiNoteService";
import { recordAiUsage, resolvePromptVersion } from "@/lib/aiTelemetry";
import { AppointmentAuditService } from "./AppointmentAuditService";
import { consumeAICredits } from "@/lib/aiCreditsMiddleware";

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

async function loadClinicalContext(
  appointmentId: string | null | undefined,
  patientId: string,
  doctorId: string,
  clinicalEncounterId?: string | null,
) {
  const [clinicalHistory, encounterHistory, questionnaire, doctor] = await Promise.all([
    prisma.clinicalHistory.findUnique({
      where: { patientId },
      select: { payload: true, completionPct: true, status: true },
    }),
    appointmentId
      ? prisma.encounterHistory.findUnique({ where: { appointmentId }, select: { payload: true, completionPct: true, status: true } })
      : clinicalEncounterId
        ? prisma.encounterHistory.findUnique({ where: { clinicalEncounterId }, select: { payload: true, completionPct: true, status: true } })
        : Promise.resolve(null),
    appointmentId
      ? prisma.questionnaire.findUnique({ where: { appointmentId }, select: { primarySymptom: true, responses: true } })
      : Promise.resolve(null),
    prisma.user.findUnique({
      where: { id: doctorId },
      select: { specialty: true },
    }),
  ]);

  const context: {
    clinicalHistory?: unknown;
    encounterHistory?: unknown;
    questionnaire?: unknown;
    specialty?: string | null;
  } = {};
  if (clinicalHistory) context.clinicalHistory = clinicalHistory;
  if (encounterHistory) context.encounterHistory = encounterHistory;
  if (questionnaire) context.questionnaire = questionnaire;
  if (doctor?.specialty) context.specialty = doctor.specialty;
  return Object.keys(context).length > 0 ? context : undefined;
}

type CreateJobInput = {
  appointmentId?: string | null;
  clinicalEncounterId?: string | null;
  doctorId: string;
  patientId: string;
  clinicId?: string | null;
  actorUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

// Audio upload always comes from an appointment context
type ProcessJobInput = {
  appointmentId: string;
  clinicalEncounterId?: string | null;
  doctorId: string;
  patientId: string;
  clinicId?: string | null;
  actorUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
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
        appointmentId: input.appointmentId ?? null,
        clinicalEncounterId: input.clinicalEncounterId ?? null,
        doctorId: input.doctorId,
        kind: "SOAP_NOTE_GENERATION",
        status: "QUEUED",
        progressPct: 5,
        statusMessage: "Audio recibido",
      },
    });

    if (input.appointmentId) {
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
        metadata: { jobId: job.id },
      });
    }

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

      const clinicalContext = await loadClinicalContext(input.appointmentId, input.patientId, input.doctorId);

      const { soap, encounter, usage } = await generateDictationFromTranscriptWithTelemetry(
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
                source: "audio_upload",
                provider: "OPENAI",
                model: usage.model,
                audioBytes: input.audioBuffer.byteLength,
                mimeType: input.mimeType,
                transcriptWords: quality.words,
                transcriptChars: quality.chars,
                inputTokens: usage.promptTokens,
                outputTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
              },
            },
            finishedAt: new Date(),
          },
        });
      });

      await recordAiUsage({
        doctorId: input.doctorId,
        clinicId: input.clinicId ?? null,
        appointmentId: input.appointmentId,
        jobId: input.jobId,
        sourceModule: "AI_NOTE_GENERATE_AUDIO",
        provider: "OPENAI",
        model: usage.model,
        promptVersion: resolvePromptVersion("AI_NOTE_GENERATE_AUDIO"),
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs: Date.now() - startedAtMs,
        status: "COMPLETED",
        metadata: {
          mode: "audio_upload",
          transcriptWords: quality.words,
          transcriptChars: quality.chars,
          audioBytes: input.audioBuffer.byteLength,
        },
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

      // Consume clinical credits for transcription and dictation
      await Promise.all([
        consumeAICredits(input.actorUserId, "transcription", `Job ${input.jobId}: transcription`),
        consumeAICredits(input.actorUserId, "dictation", `Job ${input.jobId}: dictation`),
      ]);
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

      await recordAiUsage({
        doctorId: input.doctorId,
        clinicId: input.clinicId ?? null,
        appointmentId: input.appointmentId,
        jobId: input.jobId,
        sourceModule: "AI_NOTE_GENERATE_AUDIO",
        provider: "OPENAI",
        model: "gpt-4o",
        promptVersion: resolvePromptVersion("AI_NOTE_GENERATE_AUDIO"),
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs: Date.now() - startedAtMs,
        status: "FAILED",
        errorCode: "AI_NOTE_GENERATION_FAILED",
        metadata: {
          mode: "audio_upload",
          message,
          audioBytes: input.audioBuffer.byteLength,
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

      const clinicalContext = await loadClinicalContext(input.appointmentId, input.patientId, input.doctorId, input.clinicalEncounterId);
      const quality = validateTranscriptQuality(input.transcript);
      if (!quality.ok) {
        throw new Error(quality.reason);
      }

      const { soap, encounter, usage } = await generateDictationFromTranscriptWithTelemetry(
        quality.normalized,
        {
          patientName: input.patientName,
          doctorName: input.doctorName,
        },
        clinicalContext,
      );

      await prisma.$transaction(async (tx) => {
        if (input.appointmentId) {
          await tx.clinicalNote.upsert({
            where: { appointmentId: input.appointmentId },
            update: { subjective: soap.subjective, objective: soap.objective, assessment: soap.assessment, plan: soap.plan, soapPayload: soap },
            create: { appointmentId: input.appointmentId, doctorId: input.doctorId, patientId: input.patientId, subjective: soap.subjective, objective: soap.objective, assessment: soap.assessment, plan: soap.plan, soapPayload: soap },
          });
        } else if (input.clinicalEncounterId) {
          await tx.clinicalNote.upsert({
            where: { clinicalEncounterId: input.clinicalEncounterId },
            update: { subjective: soap.subjective, objective: soap.objective, assessment: soap.assessment, plan: soap.plan, soapPayload: soap },
            create: { clinicalEncounterId: input.clinicalEncounterId, doctorId: input.doctorId, patientId: input.patientId, subjective: soap.subjective, objective: soap.objective, assessment: soap.assessment, plan: soap.plan, soapPayload: soap },
          });
        }

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
                provider: "OPENAI",
                model: usage.model,
                transcriptChars: quality.chars,
                transcriptWords: quality.words,
                inputTokens: usage.promptTokens,
                outputTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
              },
            },
            finishedAt: new Date(),
          },
        });
      });

      await recordAiUsage({
        doctorId: input.doctorId,
        clinicId: input.clinicId ?? null,
        appointmentId: input.appointmentId ?? null,
        jobId: input.jobId,
        sourceModule: "AI_NOTE_GENERATE_TRANSCRIPT",
        provider: "OPENAI",
        model: usage.model,
        promptVersion: resolvePromptVersion("AI_NOTE_GENERATE_TRANSCRIPT"),
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs: Date.now() - startedAtMs,
        status: "COMPLETED",
        metadata: {
          mode: "deepgram_stream",
          transcriptWords: quality.words,
          transcriptChars: quality.chars,
        },
      });

      if (input.appointmentId) {
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
          metadata: { jobId: input.jobId, mode: "deepgram_stream", transcriptChars: input.transcript.length, durationMs: Date.now() - startedAtMs },
        });
      }
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
          resultPayload: { meta: { source: "deepgram_stream", transcriptChars: input.transcript.length } },
          finishedAt: new Date(),
        },
      });

      await recordAiUsage({
        doctorId: input.doctorId,
        clinicId: input.clinicId ?? null,
        appointmentId: input.appointmentId ?? null,
        jobId: input.jobId,
        sourceModule: "AI_NOTE_GENERATE_TRANSCRIPT",
        provider: "OPENAI",
        model: "gpt-4o",
        promptVersion: resolvePromptVersion("AI_NOTE_GENERATE_TRANSCRIPT"),
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs: Date.now() - startedAtMs,
        status: "FAILED",
        errorCode: "AI_NOTE_GENERATION_FAILED",
        metadata: { mode: "deepgram_stream", transcriptChars: input.transcript.length, message },
      });

      if (input.appointmentId) {
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
          metadata: { jobId: input.jobId, error: message, mode: "deepgram_stream", transcriptChars: input.transcript.length, durationMs: Date.now() - startedAtMs },
        });
      }
    }
  }
}
