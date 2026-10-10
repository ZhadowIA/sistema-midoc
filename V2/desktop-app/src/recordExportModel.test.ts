import assert from "node:assert/strict";
import { test } from "node:test";
import { ageInYears, buildBlocks, doctorHeader, footerText, suggestedName, type RecordExport } from "./recordExportModel.ts";

function sample(): RecordExport {
  return {
    generated_at: "2026-10-06T18:00:00Z",
    doctor: { name: "Dra. Eva Soto", license: "1234567" },
    patient: {
      id: "p1",
      first_name: "Ana",
      last_name: "Ruiz",
      phone: "6140001111",
      email: null,
      birth_date: "1990-05-01",
      allergies: "Penicilina",
      medical_background: "Asma desde la infancia",
      family_background: "",
      is_minor: false,
      guardian: null
    },
    sex: "F",
    encounters: [
      {
        id: "e1",
        opened_at: "2026-10-01T16:00:00Z",
        status: "SIGNED",
        signed_at: "2026-10-01T16:30:00Z",
        signed_hash: "a".repeat(64),
        note_version: 2,
        note: {
          subjective: "Tos nocturna",
          objective: "",
          assessment: "Crisis leve",
          plan: "Control en 1 semana",
          diagnosis: "Asma no controlada",
          instructions: "",
          coded_diagnoses: [{ code: "J459", name: "ASMA, NO ESPECIFICADO", principal: true }]
        },
        prescription: "Salbutamol 2 disparos c/6h"
      },
      {
        id: "e2",
        opened_at: "2026-10-05T16:00:00Z",
        status: "OPEN",
        signed_at: null,
        signed_hash: null,
        note_version: 1,
        note: { subjective: "", objective: "", assessment: "", plan: "Vigilar", diagnosis: "", instructions: "" },
        prescription: null
      }
    ],
    documents: [
      {
        file_name: "espirometria.pdf",
        title: null,
        category: "LABORATORIO",
        received_at: "2026-10-01T17:00:00Z",
        encounter_id: "e1",
        sha256: "b".repeat(64)
      }
    ]
  };
}

test("el expediente completo lleva paciente, antecedentes, cada consulta y documentos", () => {
  const blocks = buildBlocks(sample(), "PDF_EXPEDIENTE", new Date("2026-10-06T12:00:00Z"));
  const titles = blocks.filter((b) => b.type === "title" || b.type === "heading").map((b) => ("text" in b ? b.text : ""));
  assert.equal(titles[0], "Expediente clínico");
  assert.equal(titles.filter((t) => t.startsWith("Consulta del")).length, 2);
  assert.equal(titles[titles.length - 1], "Documentos del expediente");

  const fields = blocks.flatMap((b) => (b.type === "field" ? [[b.label, b.text]] : []));
  assert.deepEqual(fields[0], ["Paciente", "Ana Ruiz"]);
  assert.deepEqual(fields.find(([label]) => label === "Antecedentes personales"), ["Antecedentes personales", "Asma desde la infancia"]);
  assert.ok(!fields.some(([label]) => label === "Antecedentes familiares"), "lo vacio no se imprime");
  assert.deepEqual(fields.find(([label]) => label === "Diagnóstico (CIE-10)"), [
    "Diagnóstico (CIE-10)",
    "J45.9  ASMA, NO ESPECIFICADO  (principal)\nAsma no controlada"
  ]);
  assert.ok(!fields.some(([label]) => label === "Objetivo"));
  assert.ok(blocks.some((b) => b.type === "meta" && b.text.includes("36 años") && b.text.includes("Femenino")));
  assert.ok(!blocks.some((b) => b.type === "signature"), "el expediente no es una receta");
});

test("una consulta firmada muestra su huella; una abierta lo advierte", () => {
  const blocks = buildBlocks(sample(), "PDF_EXPEDIENTE");
  const metas = blocks.filter((b) => b.type === "meta").map((b) => ("text" in b ? b.text : ""));
  assert.ok(metas.some((t) => t.includes("versión 2") && t.includes(`huella ${"a".repeat(12)}`)));
  assert.ok(blocks.some((b) => b.type === "warning" && b.text.includes("no está firmada")));
});

test("el PDF de consulta lleva espacio de firma como receta", () => {
  const data = sample();
  data.encounters = [data.encounters[0]];
  const blocks = buildBlocks(data, "PDF_CONSULTA");
  assert.equal(blocks[0].type === "title" && blocks[0].text, "Nota de consulta");
  assert.ok(blocks.some((b) => b.type === "signature"));
  assert.ok(blocks.some((b) => b.type === "field" && b.label === "Receta" && b.text.startsWith("Salbutamol")));
  assert.ok(!blocks.some((b) => b.type === "field" && b.label === "Antecedentes personales"));
});

test("avisa si faltan nombre o cedula del medico", () => {
  assert.deepEqual(doctorHeader(sample()), { lines: ["Dra. Eva Soto", "Cédula profesional 1234567"], missing: false });
  const data = sample();
  data.doctor = { name: null, license: null };
  assert.equal(doctorHeader(data).missing, true);
});

test("calcula la edad cumplida", () => {
  assert.equal(ageInYears("1990-05-01", new Date(2026, 3, 30)), 35);
  assert.equal(ageInYears("1990-05-01", new Date(2026, 4, 1)), 36);
  assert.equal(ageInYears(null, new Date()), null);
  assert.equal(ageInYears("no-fecha", new Date()), null);
});

test("pie y nombre de archivo", () => {
  assert.match(footerText(sample(), 2, 3), /Ana Ruiz · Página 2 de 3$/);
  assert.equal(suggestedName(sample(), "PDF_EXPEDIENTE"), "Expediente Ana Ruiz 2026-10-06");
});
