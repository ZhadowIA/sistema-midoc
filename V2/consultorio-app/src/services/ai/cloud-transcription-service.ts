import { AiProviderType, AiUsageStatus, AiUsageType, Prisma, type SyncDevice } from "@prisma/client";

import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { getTranscriptionCreditCost, type TranscriptionMode } from "./ai-credits";
import { debitCredits, refundUsage } from "./credit-ledger";
import { readWavDurationSeconds } from "./audio-duration";
import type {
  CloudTranscriptionProvider,
  CloudTranscriptionResult,
  CloudTranscriptSegment
} from "./cloud-transcription-provider";

// Servicio gobernado de transcripcion en nube (Ruta B, F2). Media entre la app
// de escritorio y un `CloudTranscriptionProvider` inyectable: calcula la duracion
// autoritativa del WAV y con ella el costo, reserva un uso idempotente por
// (doctorId, runId) tomando los creditos del saldo (paso 29 r3; sin saldo, 402),
// llama al proveedor y, si falla, devuelve los creditos. Nunca persiste
// audio ni transcripcion: solo metadata operativa (regla 4).

export class CloudTranscriptionServiceError extends ServiceError {}

export interface TranscribeCloudInput {
  device: SyncDevice;
  runId: string;
  mode: TranscriptionMode;
  /** Bytes del WAV. Se validan en memoria y se descartan; no se persisten. */
  audio: Uint8Array;
}

export interface TranscribeCloudResult {
  runId: string;
  provider: string;
  modelVersion: string;
  mode: TranscriptionMode;
  transcriptText: string;
  segments: CloudTranscriptSegment[] | null;
  durationSeconds: number;
  latencyMs: number;
  estimatedCostCents: number;
  creditCost: number;
}

async function getOrCreateTranscriptionProvider(name: string) {
  const existing = await prisma.aiProvider.findFirst({
    where: { name, providerType: AiProviderType.TRANSCRIPTION, modelName: null }
  });
  if (existing) {
    return existing;
  }
  return prisma.aiProvider.create({
    data: { name, providerType: AiProviderType.TRANSCRIPTION }
  });
}

function toResult(
  runId: string,
  providerName: string,
  mode: TranscriptionMode,
  providerResult: CloudTranscriptionResult,
  creditCost: number,
  durationSeconds: number
): TranscribeCloudResult {
  return {
    runId,
    provider: providerName,
    modelVersion: providerResult.model,
    mode,
    transcriptText: providerResult.text,
    segments: providerResult.segments,
    durationSeconds,
    latencyMs: providerResult.latencyMs,
    estimatedCostCents: 0,
    creditCost
  };
}

export async function transcribeCloudAudio(
  input: TranscribeCloudInput,
  provider: CloudTranscriptionProvider,
  now = new Date()
): Promise<TranscribeCloudResult> {
  const { device, runId, mode } = input;

  // 1. Duracion autoritativa: la calcula el portal del WAV validado, no confia
  // en la duracion declarada por el cliente.
  let durationSeconds: number;
  try {
    durationSeconds = readWavDurationSeconds(Buffer.from(input.audio));
  } catch {
    throw new CloudTranscriptionServiceError("El audio no es un WAV valido.", 422);
  }
  if (!(durationSeconds > 0)) {
    throw new CloudTranscriptionServiceError("El audio esta vacio.", 422);
  }
  const storedDuration = Math.round(durationSeconds);
  // 2. Costo con la duracion autoritativa: se conoce antes de llamar al proveedor.
  const creditCost = getTranscriptionCreditCost({ mode, durationSeconds });

  // 3. Reserva idempotente por (doctorId, runId).
  const existing = await prisma.aiUsageLog.findUnique({
    where: { doctorId_externalRunId: { doctorId: device.doctorId, externalRunId: runId } }
  });

  if (existing) {
    if (existing.transcriptionMode !== mode) {
      throw new CloudTranscriptionServiceError("El runId ya se uso con otro modo.", 409);
    }
    if (existing.status === AiUsageStatus.PENDING) {
      throw new CloudTranscriptionServiceError("La transcripcion de este runId esta en curso.", 409);
    }
    if (existing.status === AiUsageStatus.COMPLETED) {
      // Idempotente: reconstruye el texto llamando al proveedor pero NO vuelve a
      // cobrar (el credito ya se consumio con la duracion autoritativa original).
      const reconstructed = await callProvider(provider, input);
      return toResult(
        runId,
        provider.name,
        mode,
        reconstructed,
        existing.creditCost,
        existing.durationSeconds ?? storedDuration
      );
    }
    // FAILED: se permite reintentar reutilizando la misma fila.
  }

  const providerRow = await getOrCreateTranscriptionProvider(provider.name);

  // 3b. Reserva y cobro en la misma transaccion: sin saldo no queda reserva.
  let reservationId: string;
  try {
    reservationId = await prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.aiUsageLog.update({
            where: { id: existing.id },
            data: {
              status: AiUsageStatus.PENDING,
              creditCost,
              durationSeconds: storedDuration,
              transcriptionMode: mode,
              providerId: providerRow.id,
              reportedAt: now
            }
          })
        : await tx.aiUsageLog.create({
            data: {
              doctorId: device.doctorId,
              externalRunId: runId,
              providerId: providerRow.id,
              usageType: AiUsageType.TRANSCRIPTION,
              status: AiUsageStatus.PENDING,
              creditCost,
              durationSeconds: storedDuration,
              transcriptionMode: mode,
              inputReference: { kind: "REMOTE_AUDIO_TRANSIENT", runId },
              outputReference: { kind: "LOCAL_ENCRYPTED_TRANSCRIPT", runId },
              reportedAt: now,
              createdAt: now
            }
          });
      await debitCredits(tx, { doctorUserId: device.doctorId, credits: creditCost, aiUsageLogId: row.id, now });
      return row.id;
    });
  } catch (error) {
    // Carrera: otra solicitud con el mismo runId reservo primero.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CloudTranscriptionServiceError("La transcripcion de este runId esta en curso.", 409);
    }
    throw error;
  }

  // 4. Llamada al proveedor. Un fallo marca FAILED con 0 creditos.
  let providerResult: CloudTranscriptionResult;
  try {
    providerResult = await callProvider(provider, input);
  } catch {
    await failReservation(reservationId);
    throw new CloudTranscriptionServiceError("El proveedor de transcripcion fallo.", 502);
  }

  // 4b. Comprobacion de duracion reportada (si el proveedor la trae).
  if (providerResult.reportedDurationSeconds != null) {
    const tolerance = Math.max(2, durationSeconds * 0.02);
    if (Math.abs(providerResult.reportedDurationSeconds - durationSeconds) > tolerance) {
      await failReservation(reservationId);
      throw new CloudTranscriptionServiceError("La duracion reportada por el proveedor no coincide.", 502);
    }
  }

  // 5. Cierre del uso; los creditos ya se tomaron al reservar.
  await prisma.aiUsageLog.update({
    where: { id: reservationId },
    data: {
      status: AiUsageStatus.COMPLETED,
      modelVersion: providerResult.model,
      latencyMs: providerResult.latencyMs,
      estimatedCostCents: 0
    }
  });

  return toResult(runId, provider.name, mode, providerResult, creditCost, storedDuration);
}

/** Un uso fallido no cuesta: marca FAILED y devuelve los creditos tomados. */
async function failReservation(reservationId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.aiUsageLog.update({
      where: { id: reservationId },
      data: { status: AiUsageStatus.FAILED, creditCost: 0 }
    });
    await refundUsage(tx, reservationId);
  });
}

function callProvider(provider: CloudTranscriptionProvider, input: TranscribeCloudInput) {
  return provider.transcribe({ audio: input.audio, mode: input.mode });
}
