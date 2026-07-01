import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assignRoleToSpeaker,
  diarizedTurnsToConsultationTurns,
  swapTwoSpeakerRoles,
  transcriptToTurns
} from "./consultationScribe.ts";

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
