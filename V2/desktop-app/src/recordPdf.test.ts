import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildRecordPdf } from "./recordPdf.ts";
import type { RecordExport } from "./recordExportModel.ts";

function data(longPlan = ""): RecordExport {
  return {
    generated_at: "2026-10-06T18:00:00Z",
    doctor: { name: "Dra. Eva Soto", license: "1234567" },
    patient: {
      id: "p1",
      first_name: "Ana María",
      last_name: "Núñez",
      phone: null,
      email: null,
      birth_date: "1990-05-01",
      allergies: "Penicilina",
      medical_background: null,
      family_background: null,
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
        note_version: 1,
        note: {
          subjective: "Tos nocturna ¿desde cuándo? 3 días. PA ≥ 140 😀",
          objective: "",
          assessment: "",
          plan: longPlan || "Control",
          diagnosis: "",
          instructions: "",
          coded_diagnoses: [{ code: "J459", name: "ASMA, NO ESPECIFICADO", principal: true }]
        },
        prescription: "Salbutamol"
      }
    ],
    documents: []
  };
}

test("genera un PDF valido con metadatos del medico y acentos", async () => {
  const bytes = await buildRecordPdf(data(), "PDF_CONSULTA");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), "Nota de consulta · Ana María Núñez");
  assert.equal(pdf.getAuthor(), "Dra. Eva Soto");
  assert.equal(pdf.getProducer(), "MiDoc");
});

test("un plan largo pasa a varias paginas sin fallar", async () => {
  const longPlan = Array.from({ length: 220 }, (_, i) => `Indicacion numero ${i + 1} con detalle.`).join("\n");
  const pdf = await PDFDocument.load(await buildRecordPdf(data(longPlan), "PDF_EXPEDIENTE"));
  assert.ok(pdf.getPageCount() >= 4, `paginas: ${pdf.getPageCount()}`);
});

test("sin nombre ni cedula del medico el PDF se genera igual", async () => {
  const sample = data();
  sample.doctor = { name: null, license: null };
  const pdf = await PDFDocument.load(await buildRecordPdf(sample, "PDF_CONSULTA"), { updateMetadata: false });
  assert.equal(pdf.getAuthor(), "MiDoc");
});
