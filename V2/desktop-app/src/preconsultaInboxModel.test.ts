import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_ANSWER,
  answerRows,
  appendToSubjective,
  normalizeName,
  parseEnvelope,
  phoneKey,
  rankMatches,
  searchInbox,
  subjectiveText,
  type InboxItem
} from "./preconsultaInboxModel.ts";
import type { PreconsultaQuestionnaire } from "./preconsultaQuestionnaire.ts";

function item(overrides: Partial<InboxItem>): InboxItem {
  return {
    id: "x",
    first_name: "Ana",
    last_name: "Ruiz",
    birth_date: "1990-05-01",
    phone: "+526140001111",
    first_visit: false,
    submitted_at: "2026-10-20T15:00:00.000Z",
    received_at: "2026-10-20T15:05:00+00:00",
    is_new: true,
    ...overrides
  };
}

test("normaliza nombres y telefonos", () => {
  assert.equal(normalizeName("  JOSÉ   María "), "jose maria");
  assert.equal(phoneKey("+52 (614) 000-1111"), "6140001111");
  assert.equal(phoneKey("123"), "");
  assert.equal(phoneKey(null), "");
});

test("ordena las coincidencias por cuantos datos coinciden", () => {
  const patient = { first_name: "Ana María", last_name: "Ruíz López", birth_date: "1990-05-01", phone: "614 000 1111" };
  const matches = rankMatches(
    [
      item({ id: "solo-fecha", first_name: "Luis", last_name: "Paz", phone: "+520000000000" }),
      item({ id: "todo" }),
      item({ id: "ajeno", first_name: "Luis", last_name: "Paz", birth_date: "1980-01-01", phone: "+520000000000" }),
      item({ id: "nombre-y-tel", birth_date: "1991-01-01" })
    ],
    patient
  );
  assert.deepEqual(
    matches.map((match) => match.item.id),
    ["todo", "nombre-y-tel", "solo-fecha"]
  );
  assert.deepEqual(matches[0]!.reasons, ["nombre", "fecha de nacimiento", "teléfono"]);
});

test("sin datos del paciente solo compara el nombre", () => {
  const matches = rankMatches([item({ id: "a" })], { first_name: "ana", last_name: "RUIZ", birth_date: null, phone: null });
  assert.deepEqual(matches[0]!.reasons, ["nombre"]);
});

test("busca por nombre sin acentos o por telefono", () => {
  const items = [item({ id: "ana" }), item({ id: "jose", first_name: "José", last_name: "Núñez", phone: "+525512345678" })];
  assert.deepEqual(searchInbox(items, "jose nunez").map((i) => i.id), ["jose"]);
  assert.deepEqual(searchInbox(items, "5512").map((i) => i.id), ["jose"]);
  assert.deepEqual(searchInbox(items, "  ").map((i) => i.id), ["ana", "jose"]);
  assert.deepEqual(searchInbox(items, "pedro"), []);
});

const questionnaire: PreconsultaQuestionnaire = {
  schemaVersion: 1,
  questions: [
    { id: "motivo", label: "¿Qué te trae a consulta?", type: "long_text", required: true },
    { id: "dolor", label: "¿Tienes dolor?", type: "yes_no", required: true },
    { id: "intensidad", label: "Intensidad", type: "scale", required: false },
    { id: "desde", label: "¿Desde cuándo?", type: "date", required: false },
    { id: "sintomas", label: "Síntomas", type: "multi_choice", required: false, options: ["Tos", "Fiebre"] },
    { id: "fuma", label: "¿Fumas?", type: "yes_no", required: false }
  ]
};

const envelopeJson = JSON.stringify({
  kind: "preconsulta",
  firstVisit: false,
  submittedAt: "2026-10-20T15:00:00.000Z",
  identity: { firstName: "Ana", lastName: "Ruiz", birthDate: "1990-05-01", phoneCountry: "+52", phone: "6140001111" },
  changesSinceLastVisit: "Empecé losartán",
  answers: {
    sintomas: ["Tos", "Fiebre"],
    motivo: "Tos de tres días",
    dolor: "si",
    intensidad: "6",
    desde: "2026-10-17",
    fuma: NO_ANSWER,
    pregunta_retirada: "algo"
  }
});

test("muestra las respuestas en el orden del cuestionario y las sobrantes al final", () => {
  const envelope = parseEnvelope(envelopeJson)!;
  const rows = answerRows(envelope, questionnaire);
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ["¿Qué te trae a consulta?", "Tos de tres días"],
      ["¿Tienes dolor?", "Sí"],
      ["Intensidad", "6 de 10"],
      ["¿Desde cuándo?", "17/10/2026"],
      ["Síntomas", "Tos, Fiebre"],
      ["¿Fumas?", "Prefiero no responder"],
      ["pregunta retirada", "algo"]
    ]
  );
  // Sin definicion, todo con su clave.
  assert.equal(answerRows(envelope, null).length, 7);
});

test("arma el texto para el Subjetivo sin pisar lo escrito", () => {
  const envelope = parseEnvelope(envelopeJson)!;
  const text = subjectiveText(envelope, answerRows(envelope, questionnaire).slice(0, 2));
  assert.equal(
    text,
    "Preconsulta del paciente (20/10/2026):\n- ¿Qué te trae a consulta?: Tos de tres días\n- ¿Tienes dolor?: Sí\n- Cambios desde la última visita: Empecé losartán"
  );
  assert.equal(appendToSubjective("", text), text);
  assert.equal(appendToSubjective("Refiere tos.\n", text), `Refiere tos.\n\n${text}`);
});

test("ignora sobres ilegibles", () => {
  assert.equal(parseEnvelope("no json"), null);
  assert.equal(parseEnvelope("{}"), null);
});
