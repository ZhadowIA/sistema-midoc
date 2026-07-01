import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assignDiarizedRole,
  diarizedRolesResolved,
  diarizedSegmentsToTurns,
  transcriptToTurns
} from "./consultationScribe.ts";

test("el gate de roles exige asignar todo hablante con turnos con texto", () => {
  const review = diarizedSegmentsToTurns([
    { speaker: "speaker_0", startSeconds: 0, endSeconds: 1, text: "hola" },
    { speaker: "speaker_1", startSeconds: 1, endSeconds: 2, text: "me duele" }
  ]);
  // Ambos UNASSIGNED: no se puede acomodar todavia.
  assert.equal(diarizedRolesResolved(review), false);

  const step1 = assignDiarizedRole(review, "speaker_0", "MEDICO");
  assert.equal(diarizedRolesResolved(step1), false); // falta speaker_1

  const step2 = assignDiarizedRole(step1, "speaker_1", "PACIENTE");
  assert.equal(diarizedRolesResolved(step2), true);

  // La asignacion se refleja en hablantes y turnos (inmutable).
  assert.equal(step2.speakers.find((s) => s.id === "speaker_0")?.role, "MEDICO");
  assert.equal(step2.turns.find((t) => t.speakerId === "speaker_0")?.speakerRole, "MEDICO");
  assert.equal(review.speakers[0].role, "UNASSIGNED"); // el original no se muto
});

test("el gate ignora hablantes cuyos turnos estan vacios", () => {
  const review = diarizedSegmentsToTurns([
    { speaker: "speaker_0", startSeconds: 0, endSeconds: 1, text: "hola" },
    { speaker: "speaker_1", startSeconds: 1, endSeconds: 2, text: "   " }
  ]);
  const assigned = assignDiarizedRole(review, "speaker_0", "MEDICO");
  // speaker_1 no aporta texto: no bloquea el acomodo.
  assert.equal(diarizedRolesResolved(assigned), true);
});

test("el gate no se resuelve sin turnos con texto", () => {
  assert.equal(diarizedRolesResolved(diarizedSegmentsToTurns([])), false);
});

test("mapea segmentos anonimos del portal a hablantes etiquetados sin asumir roles", () => {
  const review = diarizedSegmentsToTurns([
    { speaker: "speaker_0", startSeconds: 0, endSeconds: 3, text: "Buenos dias" },
    { speaker: "speaker_1", startSeconds: 3, endSeconds: 7, text: "Tengo dolor" },
    { speaker: "speaker_0", startSeconds: 7, endSeconds: 9, text: "Desde cuando" }
  ]);

  // Hablantes unicos en orden de aparicion, etiquetados, sin rol asignado.
  assert.equal(review.speakers.length, 2);
  assert.equal(review.speakers[0].id, "speaker_0");
  assert.equal(review.speakers[0].label, "Hablante 1");
  assert.equal(review.speakers[1].label, "Hablante 2");
  // Ningun hablante se asume Medico/Paciente automaticamente.
  assert.ok(review.speakers.every((speaker) => speaker.role === "UNASSIGNED"));

  // Turnos en orden, con speakerId y rol UNASSIGNED.
  assert.equal(review.turns.length, 3);
  assert.equal(review.turns[0].speakerId, "speaker_0");
  assert.equal(review.turns[0].speakerRole, "UNASSIGNED");
  assert.equal(review.turns[1].text, "Tengo dolor");
  assert.equal(review.turns[2].speakerId, "speaker_0");
});

test("no genera hablantes ni turnos con una lista de segmentos vacia", () => {
  const review = diarizedSegmentsToTurns([]);
  assert.deepEqual(review.speakers, []);
  assert.deepEqual(review.turns, []);
});

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
