import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEncounterModes } from "./encounterModes.ts";
import {
  deriveTranscriptionView,
  type TranscriptionWorkspaceInput
} from "./transcriptionWorkspace.ts";

const base: TranscriptionWorkspaceInput = {
  voiceConsent: true,
  recordingState: "idle",
  processing: false,
  hasTranscript: false,
  reviewed: false,
  streamingSupported: false,
  realtimeCapable: true
};

test("renombra la sección como Transcripción consulta", () => {
  const modes = buildEncounterModes({
    hasPreconsulta: true,
    hasHistory: false,
    signed: false,
    moduleLabel: "Medicina general / familiar"
  });
  assert.equal(modes.find((mode) => mode.id === "ia")?.label, "Transcripción consulta");
});

test("no presenta capacidad casi en vivo como streaming real", () => {
  const view = deriveTranscriptionView(base);
  assert.equal(view.transcriptStatus, "Por lotes");
  assert.equal(
    view.transcriptMessage,
    "La transcripción aparecerá al finalizar la grabación."
  );
});

test("habilita Ayuda IA únicamente después de revisar el texto", () => {
  assert.equal(
    deriveTranscriptionView({ ...base, hasTranscript: true }).canUseClinicalAid,
    false
  );
  assert.equal(
    deriveTranscriptionView({ ...base, hasTranscript: true, reviewed: true })
      .canUseClinicalAid,
    true
  );
});
