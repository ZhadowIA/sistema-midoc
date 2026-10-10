import { AiProviderType, AiUsageStatus, AiUsageType, Prisma, type SyncDevice } from "@prisma/client";
import { z } from "zod";

import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { getAiCreditCost } from "./ai-credits";
import { debitCredits, refundUsage } from "./credit-ledger";
import {
  FakeGatewayProvider,
  GatewayProviderError,
  GeminiGatewayProvider,
  OpenAiGatewayProvider,
  type TextGatewayProvider
} from "./text-gateway-provider";

/**
 * Pasarela de IA de texto (paso 30). La app del medico manda contexto YA
 * seudonimizado y con consentimiento registrado (eso lo gobierna la app, paso
 * 11); el portal llama al proveedor con su clave, cobra creditos y responde.
 * Regla 4: aqui no se persiste ni se registra contenido; el `AiUsageLog` solo
 * guarda metadatos y referencias opacas.
 */
export class TextGatewayError extends ServiceError {
  constructor(
    message: string,
    status: number,
    /** Codigo estable para que la app degrade de forma explicita. */
    public readonly code: "GATEWAY_DISABLED" | "PROVIDER_OVERLOADED" | "PROVIDER_REJECTED" | "IN_PROGRESS" | "INVALID"
  ) {
    super(message, status);
  }
}

const MAX_INPUT_CHARS = 120_000;

export const gatewayRequestSchema = z.object({
  runId: z.string().uuid(),
  usageType: z.string().regex(/^[A-Z][A-Z_]{1,39}$/),
  promptVersion: z.string().min(1).max(80),
  input: z.string().min(1).max(MAX_INPUT_CHARS),
  responseSchema: z.record(z.string(), z.unknown()).nullable().default(null),
  temperature: z.number().min(0).max(1).default(0.2),
  model: z.string().max(80).optional()
});

export type GatewayRequest = z.infer<typeof gatewayRequestSchema>;

export interface GatewayStatus {
  enabled: boolean;
  provider: string | null;
  models: string[];
}

function configuredModels(): string[] {
  const defaults: Record<string, string> = { gemini: "gemini-2.5-flash", openai: "gpt-5-mini", fake: "fake-1" };
  const list = (env.AI_GATEWAY_MODELS ?? defaults[env.AI_GATEWAY_PROVIDER] ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

/** Lo que la app necesita saber para decidir si usa la pasarela. */
export function getGatewayStatus(): GatewayStatus {
  if (env.AI_GATEWAY_PROVIDER === "none") {
    return { enabled: false, provider: null, models: [] };
  }
  return { enabled: true, provider: env.AI_GATEWAY_PROVIDER, models: configuredModels() };
}

export function configuredGatewayProvider(): TextGatewayProvider | null {
  switch (env.AI_GATEWAY_PROVIDER) {
    case "gemini":
      return env.GEMINI_API_KEY ? new GeminiGatewayProvider(env.GEMINI_API_KEY) : null;
    case "openai":
      return env.OPENAI_API_KEY ? new OpenAiGatewayProvider(env.OPENAI_API_KEY) : null;
    case "fake":
      return new FakeGatewayProvider();
    default:
      return null;
  }
}

function usageTypeFor(usageType: string): AiUsageType {
  const mapping: Record<string, AiUsageType> = {
    SOAP_ASSIST: AiUsageType.SOAP_SUMMARY,
    LONGITUDINAL_SUMMARY: AiUsageType.LONGITUDINAL_SUMMARY,
    PATIENT_INSTRUCTIONS: AiUsageType.PATIENT_INSTRUCTIONS,
    CLINICAL_GAPS: AiUsageType.CLINICAL_GAP,
    VALIDATION: AiUsageType.VALIDATION
  };
  return mapping[usageType] ?? AiUsageType.OTHER;
}

async function providerRow(name: string) {
  const existing = await prisma.aiProvider.findFirst({ where: { name, providerType: AiProviderType.LLM } });
  return existing ?? prisma.aiProvider.create({ data: { name, providerType: AiProviderType.LLM } });
}

export interface GatewayResult {
  runId: string;
  provider: string;
  model: string;
  output: string;
  latencyMs: number;
  creditCost: number;
}

/**
 * Corre una generacion por la pasarela. Cobra antes de llamar al proveedor
 * (el costo depende solo del tipo de uso), devuelve los creditos si falla y es
 * idempotente por (medico, runId): repetir un uso completado no vuelve a cobrar.
 */
export async function runGatewayGeneration(
  device: SyncDevice,
  payload: unknown,
  provider: TextGatewayProvider | null = configuredGatewayProvider(),
  now = new Date()
): Promise<GatewayResult> {
  const parsed = gatewayRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TextGatewayError("Datos invalidos.", 400, "INVALID");
  }
  const request = parsed.data;
  const status = getGatewayStatus();
  if (!provider || !status.enabled) {
    throw new TextGatewayError("La pasarela de IA no esta habilitada en este portal.", 503, "GATEWAY_DISABLED");
  }
  const model = request.model ?? status.models[0];
  if (!model || !status.models.includes(model)) {
    throw new TextGatewayError("El modelo solicitado no esta habilitado en la pasarela.", 400, "INVALID");
  }
  const creditCost = getAiCreditCost(request.usageType);

  const existing = await prisma.aiUsageLog.findUnique({
    where: { doctorId_externalRunId: { doctorId: device.doctorId, externalRunId: request.runId } }
  });
  if (existing?.status === AiUsageStatus.PENDING) {
    throw new TextGatewayError("Esta solicitud de IA esta en curso.", 409, "IN_PROGRESS");
  }
  const alreadyCharged = existing !== null && existing.status !== AiUsageStatus.FAILED;

  const providerEntry = await providerRow(provider.name);
  let usageId: string;
  if (alreadyCharged) {
    usageId = existing.id;
  } else {
    try {
      usageId = await prisma.$transaction(async (tx) => {
        const data = {
          providerId: providerEntry.id,
          usageType: usageTypeFor(request.usageType),
          status: AiUsageStatus.PENDING,
          creditCost,
          promptVersion: request.promptVersion,
          modelVersion: model,
          inputReference: { kind: "REMOTE_TEXT_TRANSIENT", runId: request.runId },
          outputReference: { kind: "LOCAL_AI_RUN_OUTPUT", runId: request.runId },
          reportedAt: now
        };
        const row = existing
          ? await tx.aiUsageLog.update({ where: { id: existing.id }, data })
          : await tx.aiUsageLog.create({
              data: { ...data, doctorId: device.doctorId, externalRunId: request.runId, createdAt: now }
            });
        await debitCredits(tx, { doctorUserId: device.doctorId, credits: creditCost, aiUsageLogId: row.id, now });
        return row.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new TextGatewayError("Esta solicitud de IA esta en curso.", 409, "IN_PROGRESS");
      }
      throw error;
    }
  }

  try {
    const result = await provider.generate({
      model,
      input: request.input,
      responseSchema: request.responseSchema,
      temperature: request.temperature
    });
    if (!alreadyCharged) {
      await prisma.aiUsageLog.update({
        where: { id: usageId },
        data: { status: AiUsageStatus.COMPLETED, modelVersion: result.model, latencyMs: result.latencyMs }
      });
    }
    return {
      runId: request.runId,
      provider: provider.name,
      model: result.model,
      output: result.text,
      latencyMs: result.latencyMs,
      creditCost: alreadyCharged ? existing.creditCost : creditCost
    };
  } catch (error) {
    if (!alreadyCharged) {
      await prisma.$transaction(async (tx) => {
        await tx.aiUsageLog.update({ where: { id: usageId }, data: { status: AiUsageStatus.FAILED, creditCost: 0 } });
        await refundUsage(tx, usageId);
      });
    }
    if (error instanceof GatewayProviderError && error.retryable) {
      throw new TextGatewayError(
        "El proveedor de IA esta saturado o no disponible. No se cobraron creditos; intenta de nuevo en unos minutos.",
        503,
        "PROVIDER_OVERLOADED"
      );
    }
    throw new TextGatewayError(
      "El proveedor de IA no pudo completar la solicitud. No se cobraron creditos.",
      502,
      "PROVIDER_REJECTED"
    );
  }
}
