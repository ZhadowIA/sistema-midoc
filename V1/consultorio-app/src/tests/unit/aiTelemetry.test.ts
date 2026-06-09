import assert from "node:assert/strict";
import prisma from "../../lib/prisma.ts";
import { estimateAiCost, getMonthlyUsagePeriod, recordAiUsage, resolvePromptVersion } from "../../lib/aiTelemetry.ts";
import { runSuite } from "../testHarness.ts";

export async function runAiTelemetryUnitTests() {
  await runSuite("Unit: aiTelemetry", [
    {
      name: "estimateAiCost calcula costo por modelo y redondea a 6 decimales",
      run: async () => {
        const cost = estimateAiCost({
          model: "gpt-4o",
          inputTokens: 1500,
          outputTokens: 500,
        });
        assert.equal(cost, 0.015);
      },
    },
    {
      name: "resolvePromptVersion retorna versión por módulo",
      run: async () => {
        assert.equal(resolvePromptVersion("AI_INSIGHTS"), "v1-insights-4o");
        assert.equal(resolvePromptVersion("AI_PRESCRIPTION_VALIDATE"), "v1-pharmacovigilance-4o");
        assert.equal(resolvePromptVersion("AI_PATIENT_INSTRUCTIONS"), "v1-patient-instructions-4o");
      },
    },
    {
      name: "getMonthlyUsagePeriod retorna límites UTC del mes",
      run: async () => {
        const period = getMonthlyUsagePeriod(new Date("2026-04-27T18:30:00.000Z"));
        assert.equal(period.periodStart.toISOString(), "2026-04-01T00:00:00.000Z");
        assert.equal(period.periodEnd.toISOString(), "2026-05-01T00:00:00.000Z");
      },
    },
    {
      name: "recordAiUsage persiste eventos y actualiza resumen mensual",
      run: async () => {
        const originalCreate = prisma.aIUsageEvent.create;
        const originalSummaryDelegate = (prisma as unknown as { aIUsageMonthlySummary?: unknown }).aIUsageMonthlySummary;
        const persisted: Array<Record<string, unknown>> = [];
        const summaryUpserts: unknown[] = [];
        try {
          (prisma.aIUsageEvent.create as unknown as (args: { data: Record<string, unknown> }) => Promise<unknown>) =
            async (args) => {
              persisted.push(args.data);
              return args.data;
            };
          (prisma as unknown as { aIUsageMonthlySummary?: { upsert: (args: unknown) => Promise<unknown> } }).aIUsageMonthlySummary = {
            upsert: async (args: unknown) => {
              summaryUpserts.push(args);
              return args;
            },
          };

          await recordAiUsage({
            doctorId: "doctor-1",
            sourceModule: "AI_INSIGHTS",
            provider: "OPENAI",
            model: "gpt-4o",
            promptVersion: resolvePromptVersion("AI_INSIGHTS"),
            inputTokens: 120,
            outputTokens: 80,
            status: "COMPLETED",
          });

          await recordAiUsage({
            doctorId: "doctor-1",
            sourceModule: "AI_INSIGHTS",
            provider: "OPENAI",
            model: "gpt-4o",
            promptVersion: resolvePromptVersion("AI_INSIGHTS"),
            status: "FAILED",
            errorCode: "AI_INSIGHTS_FAILED",
          });

          assert.equal(persisted.length, 2);
          assert.equal(persisted[0].status, "COMPLETED");
          assert.equal(persisted[0].totalTokens, 200);
          assert.equal(persisted[1].status, "FAILED");
          assert.equal(persisted[1].errorCode, "AI_INSIGHTS_FAILED");
          assert.equal(summaryUpserts.length, 2);
        } finally {
          prisma.aIUsageEvent.create = originalCreate;
          (prisma as unknown as { aIUsageMonthlySummary?: unknown }).aIUsageMonthlySummary = originalSummaryDelegate;
        }
      },
    },
  ]);
}
