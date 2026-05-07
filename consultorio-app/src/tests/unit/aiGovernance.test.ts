import assert from "node:assert/strict";
import { estimateAiCost, resolvePromptVersion } from "../../lib/aiTelemetry.ts";
import { runSuite } from "../testHarness.ts";

export async function runAiGovernanceUnitTests() {
  await runSuite("Unit: aiGovernance (Bloque 11.3)", [
    {
      name: "resolvePromptVersion cubre todos los módulos activos",
      run: () => {
        const modules = [
          "AI_NOTE_GENERATE_AUDIO",
          "AI_NOTE_GENERATE_TRANSCRIPT",
          "AI_INSIGHTS",
          "AI_PRESCRIPTION_VALIDATE",
          "AI_CLINICAL_GAPS",
          "AI_QUESTIONNAIRE_INTERVIEW",
          "AI_PATIENT_INSTRUCTIONS",
        ] as const;
        for (const m of modules) {
          const v = resolvePromptVersion(m);
          assert.ok(
            typeof v === "string" && v.length > 0,
            `resolvePromptVersion("${m}") debe retornar una cadena no vacía`,
          );
          assert.ok(
            v.startsWith("v"),
            `La versión de prompt "${v}" para ${m} debe comenzar con "v"`,
          );
        }
      },
    },
    {
      name: "estimateAiCost usa precio por defecto para modelo desconocido",
      run: () => {
        const cost = estimateAiCost({
          model: "modelo-desconocido-xyz",
          inputTokens: 1000,
          outputTokens: 1000,
        });
        // default: 0.005 input + 0.015 output per 1k → (1 * 0.005) + (1 * 0.015) = 0.02
        assert.equal(cost, 0.02);
      },
    },
    {
      name: "estimateAiCost no produce valores negativos con tokens cero",
      run: () => {
        const cost = estimateAiCost({ model: "gpt-4o", inputTokens: 0, outputTokens: 0 });
        assert.equal(cost, 0);
      },
    },
    {
      name: "estimateAiCost no produce valores negativos con tokens negativos",
      run: () => {
        const cost = estimateAiCost({ model: "gpt-4o", inputTokens: -100, outputTokens: -50 });
        assert.equal(cost, 0);
      },
    },
    {
      name: "estimateAiCost redondea a 6 decimales",
      run: () => {
        const cost = estimateAiCost({ model: "gpt-4o", inputTokens: 1, outputTokens: 1 });
        const decimals = cost.toString().split(".")[1]?.length ?? 0;
        assert.ok(decimals <= 6, `Esperaba máximo 6 decimales, obtuvo ${decimals}`);
      },
    },
  ]);
}
