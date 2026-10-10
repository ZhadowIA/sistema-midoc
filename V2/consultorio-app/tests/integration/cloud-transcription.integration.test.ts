import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";
import { AiCreditGrantKind } from "@prisma/client";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import { getCreditBalance, grantCredits } from "../../src/services/ai/credit-ledger";
import {
  authenticateSyncDevice,
  linkSyncDevice,
  recordAiUsageBatch
} from "../../src/services/sync/sync-service";
import {
  CloudTranscriptionServiceError,
  transcribeCloudAudio
} from "../../src/services/ai/cloud-transcription-service";
import type {
  CloudTranscriptionProvider,
  CloudTranscriptionRequest,
  CloudTranscriptionResult
} from "../../src/services/ai/cloud-transcription-provider";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function bearerRequest(token: string) {
  return new Request("http://localhost/api/sync/ai/transcriptions", {
    headers: { authorization: `Bearer ${token}` }
  });
}

// WAV PCM16 minimo: byteRate = sampleRate * canales * bytesPorMuestra; la
// duracion = dataSize / byteRate. 16000 Hz mono 16-bit => 32000 B/s.
function buildWav(durationSeconds: number): Uint8Array {
  const sampleRate = 16000;
  const channels = 1;
  const bytesPerSample = 2;
  const byteRate = sampleRate * channels * bytesPerSample;
  const dataSize = byteRate * durationSeconds;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(dataSize)]);
}

// Proveedor fake inyectable: nunca llama a OpenAI real.
function fakeProvider(options: { fail?: boolean } = {}): CloudTranscriptionProvider {
  return {
    name: "openai",
    async transcribe(request: CloudTranscriptionRequest): Promise<CloudTranscriptionResult> {
      if (options.fail) {
        throw new Error("provider boom");
      }
      const diarized = request.mode === "diarized";
      return {
        text: "paciente refiere dolor",
        segments: diarized
          ? [{ speaker: "speaker_0", startSeconds: 0, endSeconds: 1, text: "paciente refiere dolor" }]
          : null,
        reportedDurationSeconds: null,
        model: diarized ? "gpt-4o-transcribe-diarize" : "gpt-4o-mini-transcribe",
        latencyMs: 5
      };
    }
  };
}

const createdEmails: string[] = [];

async function setupDoctor(credits: number) {
  const email = uniqueEmail("doctor-cloud");
  createdEmails.push(email);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Ana",
    lastName: "Reyes",
    professionalName: "Dra. Ana Reyes",
    licenseNumber: "7654321",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  await approveDoctorAccountForTesting(prisma, account.user.id);
  if (credits > 0) {
    await grantCredits({ doctorUserId: account.user.id, kind: AiCreditGrantKind.TOP_UP, credits, actorUserId: null });
  }
  const { deviceToken } = await linkSyncDevice(account.user.id, "PC nube");
  const device = await authenticateSyncDevice(bearerRequest(deviceToken));
  return { device, userId: account.user.id };
}

async function usageRow(doctorId: string, runId: string) {
  return prisma.aiUsageLog.findUnique({
    where: { doctorId_externalRunId: { doctorId, externalRunId: runId } }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.aiUsageLog.deleteMany({ where: { doctorId: user.id } });
    const provider = await prisma.doctorProfile.findUnique({ where: { userId: user.id } });
    if (provider) {
      await prisma.doctorSubscription.deleteMany({ where: { doctorProfileId: provider.id } });
    }
    await prisma.syncDevice.deleteMany({ where: { doctorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

describe("governed cloud transcription service", () => {
  it("charges one credit for a 900s standard transcription", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();

    const result = await transcribeCloudAudio(
      { device, runId, mode: "standard", audio: buildWav(900) },
      fakeProvider()
    );

    expect(result.creditCost).toBe(1);
    expect(result.transcriptText).toBe("paciente refiere dolor");
    const row = await usageRow(device.doctorId, runId);
    expect(row?.status).toBe("COMPLETED");
    expect(row?.creditCost).toBe(1);
    expect(row?.transcriptionMode).toBe("standard");
    expect(row?.durationSeconds).toBe(900);
  });

  it("charges two credits for a 901s standard transcription", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();
    const result = await transcribeCloudAudio(
      { device, runId, mode: "standard", audio: buildWav(901) },
      fakeProvider()
    );
    expect(result.creditCost).toBe(2);
  });

  it("charges one credit for a 600s diarized transcription and returns segments", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();
    const result = await transcribeCloudAudio(
      { device, runId, mode: "diarized", audio: buildWav(600) },
      fakeProvider()
    );
    expect(result.creditCost).toBe(1);
    expect(result.segments).toHaveLength(1);
    expect(result.segments?.[0]?.speaker).toBe("speaker_0");
  });

  it("marks a provider failure as FAILED with zero credits", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();
    await expect(
      transcribeCloudAudio(
        { device, runId, mode: "standard", audio: buildWav(120) },
        fakeProvider({ fail: true })
      )
    ).rejects.toBeInstanceOf(CloudTranscriptionServiceError);
    const row = await usageRow(device.doctorId, runId);
    expect(row?.status).toBe("FAILED");
    expect(row?.creditCost).toBe(0);
  });

  it("is idempotent: a retry with the same runId keeps one row and the same credit", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();
    const first = await transcribeCloudAudio(
      { device, runId, mode: "standard", audio: buildWav(900) },
      fakeProvider()
    );
    const second = await transcribeCloudAudio(
      { device, runId, mode: "standard", audio: buildWav(900) },
      fakeProvider()
    );
    expect(first.creditCost).toBe(1);
    expect(second.creditCost).toBe(1);
    const rows = await prisma.aiUsageLog.count({
      where: { doctorId: device.doctorId, externalRunId: runId }
    });
    expect(rows).toBe(1);
  });

  it("rejects reusing a runId with a different mode", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();
    await transcribeCloudAudio(
      { device, runId, mode: "standard", audio: buildWav(120) },
      fakeProvider()
    );
    await expect(
      transcribeCloudAudio(
        { device, runId, mode: "diarized", audio: buildWav(120) },
        fakeProvider()
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a doctor without enough credits and leaves no reservation", async () => {
    const { device } = await setupDoctor(1);
    const runId = randomUUID();
    // 1801 s estandar cuestan 3 creditos; el saldo es 1.
    await expect(
      transcribeCloudAudio({ device, runId, mode: "standard", audio: buildWav(1801) }, fakeProvider())
    ).rejects.toMatchObject({ status: 402 });
    expect(await usageRow(device.doctorId, runId)).toBeNull();
    expect((await getCreditBalance(device.doctorId)).balance).toBe(1);

    const broke = await setupDoctor(0);
    await expect(
      transcribeCloudAudio({ device: broke.device, runId: randomUUID(), mode: "standard", audio: buildWav(60) }, fakeProvider())
    ).rejects.toMatchObject({ status: 402 });
  });

  it("charges the balance once and refunds a provider failure", async () => {
    const { device } = await setupDoctor(5);
    const runId = randomUUID();
    await transcribeCloudAudio({ device, runId, mode: "standard", audio: buildWav(900) }, fakeProvider());
    await transcribeCloudAudio({ device, runId, mode: "standard", audio: buildWav(900) }, fakeProvider());
    expect((await getCreditBalance(device.doctorId)).balance).toBe(4);

    await expect(
      transcribeCloudAudio({ device, runId: randomUUID(), mode: "diarized", audio: buildWav(1200) }, fakeProvider({ fail: true }))
    ).rejects.toMatchObject({ status: 502 });
    expect((await getCreditBalance(device.doctorId)).balance).toBe(4);
  });

  it("does not spend the same credit twice when two transcriptions race", async () => {
    const { device } = await setupDoctor(1);
    const attempts = await Promise.allSettled(
      [randomUUID(), randomUUID(), randomUUID()].map((runId) =>
        transcribeCloudAudio({ device, runId, mode: "standard", audio: buildWav(60) }, fakeProvider())
      )
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect((await getCreditBalance(device.doctorId)).balance).toBe(0);
  });

  it("never persists transcript text or audio in the portal", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();
    await transcribeCloudAudio(
      { device, runId, mode: "diarized", audio: buildWav(120) },
      fakeProvider()
    );
    const row = await usageRow(device.doctorId, runId);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("paciente refiere dolor");
    expect(serialized).not.toContain("speaker_0");
  });
});

describe("sync report preserves portal-authoritative cloud credits", () => {
  it("charges zero credits for a local Whisper transcription report", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();
    await recordAiUsageBatch(device, {
      runs: [
        {
          externalRunId: runId,
          usageType: "TRANSCRIPTION",
          status: "APPROVED",
          providerName: "whisper-local-medium",
          providerType: "TRANSCRIPTION",
          occurredAt: "2026-06-30T12:00:00.000+00:00",
          inputReference: { kind: "LOCAL_AI_AUDIO_INPUT", localRunId: "local-tx" },
          outputReference: { kind: "LOCAL_AI_TRANSCRIPT_OUTPUT", localRunId: "local-tx" }
        }
      ]
    });
    const row = await usageRow(device.doctorId, runId);
    expect(row?.creditCost).toBe(0);
  });

  it("does not let a later desktop report overwrite the portal credit", async () => {
    const { device } = await setupDoctor(10);
    const runId = randomUUID();

    // 1000 s => 2 creditos; asi el flat de 1 del desktop rompe el test si sobrescribe.
    await transcribeCloudAudio(
      { device, runId, mode: "standard", audio: buildWav(1000) },
      fakeProvider()
    );

    // Reporte posterior del desktop (revision) con el mismo runId.
    await recordAiUsageBatch(device, {
      runs: [
        {
          externalRunId: runId,
          usageType: "TRANSCRIPTION",
          status: "APPROVED",
          providerName: "openai",
          providerType: "TRANSCRIPTION",
          occurredAt: "2026-06-30T12:05:00.000+00:00",
          inputReference: { kind: "LOCAL_AI_AUDIO_INPUT", localRunId: "local-tx" },
          outputReference: { kind: "LOCAL_AI_TRANSCRIPT_OUTPUT", localRunId: "local-tx" }
        }
      ]
    });

    const row = await usageRow(device.doctorId, runId);
    // Credito, duracion y modo autoritativos del portal, intactos.
    expect(row?.creditCost).toBe(2);
    expect(row?.durationSeconds).toBe(1000);
    expect(row?.transcriptionMode).toBe("standard");
    // El estado de revision si se actualiza.
    expect(row?.status).toBe("REVIEWED");
  });
});
