import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assignDiarizedRole,
  assignRoleToSpeaker,
  diarizedReviewToConsultationTurns,
  diarizedRolesResolved,
  diarizedSegmentsToTurns,
  diarizedTurnsToConsultationTurns,
  swapTwoSpeakerRoles,
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

test("comprime segmentos consecutivos del mismo hablante en un solo turno (nube)", () => {
  const review = diarizedSegmentsToTurns([
    { speaker: "speaker_0", startSeconds: 0, endSeconds: 2, text: "Paciente masculino de 20 años" },
    { speaker: "speaker_0", startSeconds: 2, endSeconds: 4, text: "con una lesión necrótica," },
    { speaker: "speaker_0", startSeconds: 4, endSeconds: 6, text: "3 semanas después de salmonelosis" },
    { speaker: "speaker_1", startSeconds: 6, endSeconds: 8, text: "Entiendo" },
    { speaker: "speaker_0", startSeconds: 8, endSeconds: 9, text: "¿Qué opina?" }
  ]);

  // 5 segmentos → 3 turnos: los 3 primeros del mismo hablante se fusionan; la
  // intervencion de otro hablante corta la fusion (no se agrupa globalmente).
  assert.deepEqual(
    review.turns.map((t) => [t.speakerId, t.text]),
    [
      ["speaker_0", "Paciente masculino de 20 años con una lesión necrótica, 3 semanas después de salmonelosis"],
      ["speaker_1", "Entiendo"],
      ["speaker_0", "¿Qué opina?"]
    ]
  );
  // El rango de tiempo del turno fusionado abarca del primero al ultimo corte.
  assert.equal(review.turns[0].startSeconds, 0);
  assert.equal(review.turns[0].endSeconds, 6);
  assert.equal(review.speakers.length, 2);
});

test("comprime turnos consecutivos de la misma voz en la diarizacion local", () => {
  const turns = diarizedTurnsToConsultationTurns([
    { id: "turn-1", speakerId: "speaker-0", role: "MEDICO", text: "Paciente que inició", startCs: 0, endCs: 100 },
    { id: "turn-2", speakerId: "speaker-0", role: "MEDICO", text: "con una lesión.", startCs: 100, endCs: 200 },
    { id: "turn-3", speakerId: "speaker-1", role: "PACIENTE", text: "Sí, doctor.", startCs: 200, endCs: 300 },
    { id: "turn-4", speakerId: "speaker-0", role: "MEDICO", text: "Continúo.", startCs: 300, endCs: 400 }
  ]);

  assert.deepEqual(
    turns.map((turn) => ({ id: turn.id, speaker: turn.speaker, text: turn.text })),
    [
      { id: "turn-1", speaker: "MEDICO", text: "Paciente que inició con una lesión." },
      { id: "turn-3", speaker: "PACIENTE", text: "Sí, doctor." },
      { id: "turn-4", speaker: "MEDICO", text: "Continúo." }
    ]
  );
});

test("los turnos vacios intermedios no rompen la fusion de la misma voz", () => {
  const turns = diarizedTurnsToConsultationTurns([
    { id: "turn-1", speakerId: "speaker-0", role: "MEDICO", text: "Primera parte", startCs: 0, endCs: 100 },
    { id: "turn-2", speakerId: "speaker-0", role: "MEDICO", text: "   ", startCs: 100, endCs: 150 },
    { id: "turn-3", speakerId: "speaker-0", role: "MEDICO", text: "segunda parte.", startCs: 150, endCs: 200 }
  ]);

  assert.deepEqual(
    turns.map((turn) => turn.text),
    ["Primera parte segunda parte."]
  );
});

test("convierte un DiarizedReview resuelto a ConsultationTurn con los 4 roles", () => {
  // ACOMPANANTE/OTRO se preservan (no colapsan a PACIENTE): el pipeline de
  // estructuracion SOAP y guardado ya acepta los 4 roles (Ruta B, F4).
  const review = diarizedSegmentsToTurns([
    { speaker: "speaker_0", startSeconds: 0, endSeconds: 1, text: "Buenos dias" },
    { speaker: "speaker_1", startSeconds: 1, endSeconds: 2, text: "Me duele" },
    { speaker: "speaker_2", startSeconds: 2, endSeconds: 3, text: "Soy su hija" }
  ]);
  const resolved = assignDiarizedRole(
    assignDiarizedRole(assignDiarizedRole(review, "speaker_0", "MEDICO"), "speaker_1", "PACIENTE"),
    "speaker_2",
    "ACOMPANANTE"
  );

  const turns = diarizedReviewToConsultationTurns(resolved);

  assert.deepEqual(
    turns.map((t) => [t.speaker, t.text]),
    [
      ["MEDICO", "Buenos dias"],
      ["PACIENTE", "Me duele"],
      ["ACOMPANANTE", "Soy su hija"]
    ]
  );
  assert.deepEqual(
    turns.map((t) => t.id),
    resolved.turns.map((t) => t.id)
  );
});

test("descarta del acomodo los turnos con texto vacio y los hablantes sin rol", () => {
  const review = diarizedSegmentsToTurns([
    { speaker: "speaker_0", startSeconds: 0, endSeconds: 1, text: "Buenos dias" },
    { speaker: "speaker_1", startSeconds: 1, endSeconds: 2, text: "   " }
  ]);
  const resolved = assignDiarizedRole(review, "speaker_0", "MEDICO");

  const turns = diarizedReviewToConsultationTurns(resolved);

  assert.equal(turns.length, 1);
  assert.equal(turns[0].speaker, "MEDICO");
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

test("convierte turnos diarizados preservando speaker tecnico y rol clinico", () => {
  const turns = diarizedTurnsToConsultationTurns([
    {
      id: "turn-1",
      speakerId: "speaker-0",
      role: "MEDICO",
      text: "¿Cuál es tu nombre?",
      startCs: 0,
      endCs: 120
    },
    {
      id: "turn-2",
      speakerId: "speaker-1",
      role: "PACIENTE",
      text: "Dana Rodríguez.",
      startCs: 120,
      endCs: 220
    }
  ]);

  assert.deepEqual(
    turns.map((turn) => ({ speakerId: turn.speakerId, speaker: turn.speaker, text: turn.text })),
    [
      { speakerId: "speaker-0", speaker: "MEDICO", text: "¿Cuál es tu nombre?" },
      { speakerId: "speaker-1", speaker: "PACIENTE", text: "Dana Rodríguez." }
    ]
  );
});

test("reasigna todos los turnos de un speaker tecnico sin cambiar texto", () => {
  const turns = diarizedTurnsToConsultationTurns([
    { id: "turn-1", speakerId: "speaker-0", role: "MEDICO", text: "Pregunta.", startCs: 0, endCs: 100 },
    { id: "turn-2", speakerId: "speaker-1", role: "PACIENTE", text: "Respuesta.", startCs: 100, endCs: 200 },
    { id: "turn-3", speakerId: "speaker-0", role: "MEDICO", text: "Otra pregunta.", startCs: 200, endCs: 300 }
  ]);

  const reassigned = assignRoleToSpeaker(turns, "speaker-0", "PACIENTE");

  assert.deepEqual(
    reassigned.map((turn) => ({ speakerId: turn.speakerId, speaker: turn.speaker, text: turn.text })),
    [
      { speakerId: "speaker-0", speaker: "PACIENTE", text: "Pregunta." },
      { speakerId: "speaker-1", speaker: "PACIENTE", text: "Respuesta." },
      { speakerId: "speaker-0", speaker: "PACIENTE", text: "Otra pregunta." }
    ]
  );
});

test("intercambia roles globales cuando hay exactamente dos speakers tecnicos", () => {
  const turns = diarizedTurnsToConsultationTurns([
    { id: "turn-1", speakerId: "speaker-0", role: "MEDICO", text: "Pregunta.", startCs: 0, endCs: 100 },
    { id: "turn-2", speakerId: "speaker-1", role: "PACIENTE", text: "Respuesta.", startCs: 100, endCs: 200 },
    { id: "turn-3", speakerId: "speaker-0", role: "MEDICO", text: "Seguimiento.", startCs: 200, endCs: 300 }
  ]);

  const swapped = swapTwoSpeakerRoles(turns);

  assert.deepEqual(
    swapped.map((turn) => ({ speakerId: turn.speakerId, speaker: turn.speaker, text: turn.text })),
    [
      { speakerId: "speaker-0", speaker: "PACIENTE", text: "Pregunta." },
      { speakerId: "speaker-1", speaker: "MEDICO", text: "Respuesta." },
      { speakerId: "speaker-0", speaker: "PACIENTE", text: "Seguimiento." }
    ]
  );
});
