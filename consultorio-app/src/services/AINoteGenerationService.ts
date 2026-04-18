import prisma from "@/lib/prisma";
import { generateSOAPFromTranscript, transcribeAudio } from "@/lib/aiNoteService";
import { AppointmentAuditService } from "./AppointmentAuditService";

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

      await prisma.aIProcessingJob.update({
        where: { id: input.jobId },
        data: {
          progressPct: 65,
          statusMessage: "Generando nota SOAP",
        },
      });

      const soap = await generateSOAPFromTranscript(transcript, {
        patientName: input.patientName,
        doctorName: input.doctorName,
      });

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
        },
      });
    }
  }
}
