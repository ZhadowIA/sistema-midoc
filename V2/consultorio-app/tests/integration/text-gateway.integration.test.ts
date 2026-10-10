import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AiCreditGrantKind, PrismaClient } from "@prisma/client";

import { POST as generateRoute } from "../../src/app/api/sync/ai/generate/route";
import { env } from "../../src/lib/env";
import { getCreditBalance, grantCredits } from "../../src/services/ai/credit-ledger";
import {
  GatewayProviderError,
  type GatewayGenerationRequest,
  type TextGatewayProvider
} from "../../src/services/ai/text-gateway-provider";
import { runGatewayGeneration } from "../../src/services/ai/text-gateway-service";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import { linkSyncDevice, recordAiUsageBatch } from "../../src/services/sync/sync-service";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

const prisma = new PrismaClient();
const createdEmails: string[] = [];
const original = { provider: env.AI_GATEWAY_PROVIDER, models: env.AI_GATEWAY_MODELS };
const SECRET = "Paciente P-1 refiere dolor toracico";

function provider(behavior: "ok" | "overloaded" | "rejected" = "ok") {
  const seen: GatewayGenerationRequest[] = [];
  const impl: TextGatewayProvider = {
    name: "test-gateway",
    async generate(request) {
      seen.push(request);
      if (behavior === "overloaded") throw new GatewayProviderError("saturado", true);
      if (behavior === "rejected") throw new GatewayProviderError("rechazo", false);
      return { text: "Indicaciones de prueba", model: request.model, latencyMs: 3 };
    }
  };
  return { impl, seen };
}

async function setup(credits: number) {
  const email = `gateway-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Eva",
    lastName: "Soto",
    professionalName: "Dra. Eva Soto",
    licenseNumber: "1234567",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  await approveDoctorAccountForTesting(prisma, account.user.id);
  if (credits > 0) {
    await grantCredits({ doctorUserId: account.user.id, kind: AiCreditGrantKind.TOP_UP, credits, actorUserId: null });
  }
  const link = await linkSyncDevice(account.user.id, "PC");
  const device = await prisma.syncDevice.findUniqueOrThrow({ where: { id: link.device.id } });
  return { device, token: link.deviceToken, doctorId: account.user.id };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    runId: randomUUID(),
    usageType: "LONGITUDINAL_SUMMARY",
    promptVersion: "summary/v1",
    input: SECRET,
    ...overrides
  };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterEach(() => {
  env.AI_GATEWAY_PROVIDER = "fake";
  env.AI_GATEWAY_MODELS = "modelo-a,modelo-b";
});

afterAll(async () => {
  env.AI_GATEWAY_PROVIDER = original.provider;
  env.AI_GATEWAY_MODELS = original.models;
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.aiUsageLog.deleteMany({ where: { doctorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

describe("AI text gateway (paso 30)", () => {
  it("charges the usage cost, answers, and never stores the content", async () => {
    env.AI_GATEWAY_PROVIDER = "fake";
    env.AI_GATEWAY_MODELS = "modelo-a,modelo-b";
    const { device, doctorId } = await setup(5);
    const { impl, seen } = provider();
    const request = payload();

    const result = await runGatewayGeneration(device, request, impl);
    expect(result).toMatchObject({ runId: request.runId, output: "Indicaciones de prueba", model: "modelo-a", creditCost: 2 });
    expect(seen[0]).toMatchObject({ model: "modelo-a", input: SECRET, responseSchema: null });
    expect((await getCreditBalance(doctorId)).balance).toBe(3);

    const row = await prisma.aiUsageLog.findFirstOrThrow({ where: { doctorId, externalRunId: request.runId } });
    expect(row.status).toBe("COMPLETED");
    expect(JSON.stringify(row)).not.toContain("toracico");
    expect(JSON.stringify(row)).not.toContain("Indicaciones de prueba");

    // Reintento del mismo runId: responde otra vez sin volver a cobrar.
    await runGatewayGeneration(device, request, impl);
    expect((await getCreditBalance(doctorId)).balance).toBe(3);

    // Un modelo alterno permitido y uno que no.
    const alt = await runGatewayGeneration(device, payload({ model: "modelo-b", usageType: "PATIENT_INSTRUCTIONS" }), impl);
    expect(alt.model).toBe("modelo-b");
    await expect(runGatewayGeneration(device, payload({ model: "otro" }), impl)).rejects.toMatchObject({ status: 400 });
  });

  it("refunds and degrades explicitly when the provider is overloaded or rejects", async () => {
    const { device, doctorId } = await setup(5);
    await expect(runGatewayGeneration(device, payload(), provider("overloaded").impl)).rejects.toMatchObject({
      status: 503,
      code: "PROVIDER_OVERLOADED"
    });
    await expect(runGatewayGeneration(device, payload(), provider("rejected").impl)).rejects.toMatchObject({
      status: 502,
      code: "PROVIDER_REJECTED"
    });
    expect((await getCreditBalance(doctorId)).balance).toBe(5);
  });

  it("refuses without credits, when disabled, and with invalid input", async () => {
    const broke = await setup(0);
    await expect(runGatewayGeneration(broke.device, payload(), provider().impl)).rejects.toMatchObject({ status: 402 });
    expect(await prisma.aiUsageLog.count({ where: { doctorId: broke.doctorId } })).toBe(0);

    env.AI_GATEWAY_PROVIDER = "none";
    const { device } = await setup(5);
    await expect(runGatewayGeneration(device, payload(), provider().impl)).rejects.toMatchObject({
      status: 503,
      code: "GATEWAY_DISABLED"
    });
    env.AI_GATEWAY_PROVIDER = "fake";
    await expect(runGatewayGeneration(device, payload({ runId: "no-uuid" }), provider().impl)).rejects.toMatchObject({
      status: 400
    });
  });

  it("keeps the gateway charge when the app reports the same run later", async () => {
    const { device, doctorId } = await setup(5);
    const request = payload();
    await runGatewayGeneration(device, request, provider().impl);
    const report = (status: string) => ({
      runs: [
        {
          externalRunId: request.runId,
          usageType: "LONGITUDINAL_SUMMARY",
          status,
          providerName: "midoc-gateway",
          providerType: "LLM",
          modelVersion: "modelo-a",
          promptVersion: "summary/v1",
          estimatedCostCents: 0,
          latencyMs: 3,
          occurredAt: new Date().toISOString(),
          inputReference: { kind: "LOCAL_AI_RUN_INPUT", localRunId: request.runId },
          outputReference: { kind: "LOCAL_AI_RUN_OUTPUT", localRunId: request.runId }
        }
      ]
    });
    // La app reporta primero el borrador sin revisar: no debe regresar a "en curso".
    await recordAiUsageBatch(device, report("DRAFT"));
    const draft = await prisma.aiUsageLog.findFirstOrThrow({ where: { doctorId, externalRunId: request.runId } });
    expect(draft.status).toBe("COMPLETED");
    await recordAiUsageBatch(device, {
      runs: [
        {
          externalRunId: request.runId,
          usageType: "LONGITUDINAL_SUMMARY",
          status: "APPROVED",
          providerName: "midoc-gateway",
          providerType: "LLM",
          modelVersion: "modelo-a",
          promptVersion: "summary/v1",
          estimatedCostCents: 0,
          latencyMs: 3,
          occurredAt: new Date().toISOString(),
          inputReference: { kind: "LOCAL_AI_RUN_INPUT", localRunId: request.runId },
          outputReference: { kind: "LOCAL_AI_RUN_OUTPUT", localRunId: request.runId }
        }
      ]
    });
    const row = await prisma.aiUsageLog.findFirstOrThrow({ where: { doctorId, externalRunId: request.runId } });
    expect(row.creditCost).toBe(2);
    expect(row.status).toBe("REVIEWED");
    expect((row.inputReference as { kind: string }).kind).toBe("REMOTE_TEXT_TRANSIENT");
  });

  it("serves the route with the device token and a stable error code", async () => {
    env.AI_GATEWAY_PROVIDER = "fake";
    const { token } = await setup(5);
    const call = (body: unknown, auth = token) =>
      generateRoute(
        new Request("http://localhost/api/sync/ai/generate", {
          method: "POST",
          headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
          body: JSON.stringify(body)
        })
      );
    const ok = await call(payload());
    expect(ok.status).toBe(200);
    expect((await ok.json()).output).toContain("Borrador de prueba de la pasarela");

    expect((await call(payload(), "falso")).status).toBe(401);
    const invalid = await call({ nada: true });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).code).toBe("INVALID");
  });
});
