import assert from "node:assert/strict";
import { test } from "node:test";
import { groupHits, highlight, type SearchHit } from "./searchModel.ts";

function hit(patient: string, encounter: string | null, kind: SearchHit["kind"]): SearchHit {
  return {
    patient_id: patient,
    patient_name: patient.toUpperCase(),
    encounter_id: encounter,
    encounter_opened_at: encounter ? "2026-10-01T10:00:00Z" : null,
    encounter_status: encounter ? "SIGNED" : null,
    kind,
    field: "Plan",
    snippet: "texto",
    document_id: null
  };
}

test("agrupa por paciente y por consulta conservando el orden", () => {
  const groups = groupHits([
    hit("p1", "e1", "DIAGNOSTICO"),
    hit("p2", "e2", "NOTA"),
    hit("p1", "e1", "RECETA"),
    hit("p1", null, "DOCUMENTO")
  ]);
  assert.deepEqual(
    groups.map((g) => [g.patientId, g.encounters.map((e) => [e.encounterId, e.hits.map((h) => h.kind)])]),
    [
      [
        "p1",
        [
          ["e1", ["DIAGNOSTICO", "RECETA"]],
          [null, ["DOCUMENTO"]]
        ]
      ],
      ["p2", [["e2", ["NOTA"]]]]
    ]
  );
});

test("resalta sin importar acentos ni mayusculas", () => {
  assert.deepEqual(highlight("Crisis asmática leve", ["ASMATICA"]), [
    { text: "Crisis ", match: false },
    { text: "asmática", match: true },
    { text: " leve", match: false }
  ]);
});

test("resalta varias palabras y los nombres expandidos", () => {
  const segments = highlight("Tempra 500 mg y salbutamol", ["paracetamol", "Tempra", "salbutamol"]);
  assert.deepEqual(
    segments.filter((s) => s.match).map((s) => s.text),
    ["Tempra", "salbutamol"]
  );
});

test("sin terminos no resalta nada", () => {
  assert.deepEqual(highlight("Texto", []), [{ text: "Texto", match: false }]);
});
