import assert from "node:assert/strict";
import {
  buildInsightApplicationKey,
  isInsightApplied,
  markInsightApplied,
} from "../../lib/aiInsights.ts";
import { runSuite } from "../testHarness.ts";

export async function runAiInsightsUnitTests() {
  await runSuite("Unit: aiInsights", [
    {
      name: "buildInsightApplicationKey normaliza espacios y mayúsculas",
      run: () => {
        assert.equal(
          buildInsightApplicationKey("  Dolor   torácico   agudo "),
          "dolor torácico agudo",
        );
      },
    },
    {
      name: "markInsightApplied agrega una sola vez",
      run: () => {
        const first = markInsightApplied({}, "Paracetamol 500 mg cada 8h");
        const second = markInsightApplied(first, "  paracetamol 500 mg cada 8h ");
        assert.equal(Object.keys(first).length, 1);
        assert.equal(Object.keys(second).length, 1);
      },
    },
    {
      name: "isInsightApplied detecta sugerencia aplicada",
      run: () => {
        const state = markInsightApplied({}, "Reposo relativo por 48 horas");
        assert.equal(isInsightApplied(state, "reposo relativo por 48 horas"), true);
        assert.equal(isInsightApplied(state, "Hidratación oral"), false);
      },
    },
  ]);
}

