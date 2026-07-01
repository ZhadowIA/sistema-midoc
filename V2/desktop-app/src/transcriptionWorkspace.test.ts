import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildEncounterModes } from "./encounterModes.ts";
import {
  deriveTranscriptionView,
  DEFAULT_SPEAKER_COUNT,
  speakerCountLabel,
  SPEAKER_COUNT_OPTIONS,
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

test("ofrece Auto/1/2/3 voces con default en 2 (consulta típica)", () => {
  assert.equal(DEFAULT_SPEAKER_COUNT, 2);
  assert.deepEqual(
    SPEAKER_COUNT_OPTIONS.map((option) => option.value),
    [0, 1, 2, 3]
  );
  assert.equal(speakerCountLabel(0), "Auto (detectar)");
  assert.equal(speakerCountLabel(1), "1 · dictado");
  assert.equal(speakerCountLabel(2), "2 · médico y paciente");
});

test("descartar una transcripción revisada la elimina del almacenamiento y de la pantalla", () => {
  const source = readFileSync(new URL("./Atencion.tsx", import.meta.url), "utf8");
  assert.match(source, /call\("ai_discard_reviewed_transcription"/);
  assert.match(source, /setReviewedTranscription\(null\)/);
  assert.match(source, /setScribeTurns\(\[\]\)/);
});
