import assert from "node:assert/strict";
import { test } from "node:test";

import { transcriptToTurns } from "./consultationScribe.ts";

test("no se rompe con texto ausente (undefined/null/vacio)", () => {
  // Regresion: un borrador sin transcript_text (p. ej. desajuste de
  // serializacion) dejaba undefined y reventaba con ".split of undefined".
  assert.deepEqual(transcriptToTurns(undefined), []);
  assert.deepEqual(transcriptToTurns(null), []);
  assert.deepEqual(transcriptToTurns(""), []);
  assert.deepEqual(transcriptToTurns("   \n  "), []);
});

test("alterna medico/paciente cuando no hay prefijos de hablante", () => {
  const turns = transcriptToTurns("Hola, cuenteme.\nMe duele la cabeza.");
  assert.equal(turns.length, 2);
  assert.equal(turns[0].speaker, "MEDICO");
  assert.equal(turns[1].speaker, "PACIENTE");
  assert.equal(turns[0].text, "Hola, cuenteme.");
});

test("respeta los prefijos explicitos de hablante", () => {
  const turns = transcriptToTurns("Paciente: me duele.\nMedico: desde cuando?");
  assert.equal(turns[0].speaker, "PACIENTE");
  assert.equal(turns[0].text, "me duele.");
  assert.equal(turns[1].speaker, "MEDICO");
});
