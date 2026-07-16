import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_DENTAL_PAYLOAD } from "./clinicalProfiles.ts";
import {
  applyOdontogramTool,
  compareTeeth,
  initialSignedPayload,
  parseSignedDentalHistory,
  recordUndoAction,
  redoOdontogramAction,
  undoOdontogramAction
} from "./odontogramWorkspaceModel.ts";

test("aplica herramientas de superficie y pieza sin mutar el payload", () => {
  const before = structuredClone(EMPTY_DENTAL_PAYLOAD);
  const restored = applyOdontogramTool(EMPTY_DENTAL_PAYLOAD, "24", "M", {
    scope: "SURFACE",
    condition: "RESTORED",
    material: "CERAMIC"
  });
  const missing = applyOdontogramTool(restored, "16", null, {
    scope: "TOOTH",
    status: "MISSING"
  });
  assert.deepEqual(EMPTY_DENTAL_PAYLOAD, before);
  assert.deepEqual(restored.odontogram["24"].surfaces.M, {
    condition: "RESTORED",
    material: "CERAMIC"
  });
  assert.equal(missing.odontogram["16"].status, "MISSING");

  const cleaned = applyOdontogramTool(restored, "24", "M", {
    scope: "SURFACE",
    condition: "HEALTHY"
  });
  assert.equal(cleaned.odontogram["24"], undefined);
  assert.equal(
    applyOdontogramTool(EMPTY_DENTAL_PAYLOAD, "24", "M", {
      scope: "SURFACE",
      condition: "HEALTHY"
    }),
    EMPTY_DENTAL_PAYLOAD
  );
});

test("compara estado, caras, materiales y notas", () => {
  const baseline = {
    status: "HEALTHY" as const,
    surfaces: { O: { condition: "RESTORED" as const, material: "RESIN" as const } },
    notes: "control"
  };
  const current = {
    status: "ROOT_CANAL" as const,
    surfaces: { O: { condition: "RESTORED" as const, material: "CERAMIC" as const } },
    notes: "seguimiento"
  };
  assert.deepEqual(compareTeeth(current, baseline), {
    changed: true,
    statusChanged: true,
    notesChanged: true,
    changedFaces: ["O"]
  });
});

test("historial odontologico usa solo consultas firmadas validas", () => {
  const signedPayload = JSON.stringify({
    odontogram: { "18": { status: "HEALTHY", surfaces: { O: "CARIES" }, notes: "" } }
  });
  const history = parseSignedDentalHistory([
    {
      encounter_id: "draft",
      opened_at: "2026-07-01",
      signed_at: null,
      status: "OPEN",
      specialty_json: signedPayload
    },
    {
      encounter_id: "general",
      opened_at: "2026-07-02",
      signed_at: "2026-07-02",
      status: "SIGNED",
      specialty_json: JSON.stringify({ riskFactors: "" })
    },
    {
      encounter_id: "signed",
      opened_at: "2026-07-03",
      signed_at: "2026-07-03",
      status: "SIGNED",
      specialty_json: signedPayload
    }
  ]);
  assert.equal(history.length, 1);
  assert.equal(history[0].encounterId, "signed");
  assert.deepEqual(history[0].payload.odontogram["18"].surfaces.O, { condition: "CARIES" });
  assert.equal(initialSignedPayload(history), history[0].payload);
});

test("deshacer y rehacer mantienen snapshots independientes", () => {
  const first = applyOdontogramTool(EMPTY_DENTAL_PAYLOAD, "18", "O", {
    scope: "SURFACE",
    condition: "CARIES"
  });
  const second = applyOdontogramTool(first, "17", null, {
    scope: "TOOTH",
    status: "CROWN"
  });
  const state = recordUndoAction(recordUndoAction({ past: [], future: [] }, EMPTY_DENTAL_PAYLOAD), first);
  const undone = undoOdontogramAction(state, second);
  assert.ok(undone);
  assert.equal(undone.payload.odontogram["17"], undefined);
  assert.deepEqual(undone.payload.odontogram["18"].surfaces.O, { condition: "CARIES" });
  const redone = redoOdontogramAction(undone.state, undone.payload);
  assert.ok(redone);
  assert.equal(redone.payload.odontogram["17"].status, "CROWN");
});
