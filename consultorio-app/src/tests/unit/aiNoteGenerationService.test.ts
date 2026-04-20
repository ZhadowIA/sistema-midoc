import assert from "node:assert/strict";
import { validateTranscriptQuality } from "../../services/AINoteGenerationService.ts";
import { runSuite } from "../testHarness.ts";

export async function runAiNoteGenerationServiceUnitTests() {
  await runSuite("Unit: aiNoteGenerationService", [
    {
      name: "validateTranscriptQuality rechaza transcript demasiado corto",
      run: () => {
        const result = validateTranscriptQuality("dolor leve desde ayer");
        assert.equal(result.ok, false);
        assert.ok(result.reason.includes("insuficiente"));
      },
    },
    {
      name: "validateTranscriptQuality acepta transcript clínico suficiente",
      run: () => {
        const result = validateTranscriptQuality(
          "Paciente refiere dolor torácico opresivo de inicio súbito hace dos horas, empeora al esfuerzo, mejora parcialmente en reposo y niega fiebre o tos.",
        );
        assert.equal(result.ok, true);
        assert.ok(result.words >= 12);
        assert.ok(result.chars >= 60);
      },
    },
    {
      name: "validateTranscriptQuality normaliza espacios múltiples",
      run: () => {
        const result = validateTranscriptQuality(
          "Paciente   con  dolor  abdominal  persistente   y náusea desde hace tres días, sin vómito ni diarrea.",
        );
        assert.equal(result.ok, true);
        assert.ok(!result.normalized.includes("  "));
      },
    },
  ]);
}

