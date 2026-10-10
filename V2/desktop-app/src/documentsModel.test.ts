import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_DOCUMENT_BYTES,
  formatBytes,
  groupDocumentsByEncounter,
  screenFiles,
  type DocumentMeta
} from "./documentsModel.ts";

function doc(id: string, encounterId: string | null, openedAt: string | null): DocumentMeta {
  return {
    id,
    patient_id: "p1",
    encounter_id: encounterId,
    encounter_opened_at: openedAt,
    file_name: `${id}.pdf`,
    title: null,
    mime_type: "application/pdf",
    category: "LABORATORIO",
    size_bytes: 10,
    sha256: null,
    source: "LOCAL",
    received_at: "2026-10-05T00:00:00Z"
  };
}

test("solo deja pasar PDF e imagenes con tamano valido", () => {
  const files = [
    { name: "biometria.pdf", size: 2000, type: "application/pdf" },
    { name: "rx.JPG", size: 2000, type: "" },
    { name: "foto.heic", size: 2000, type: "image/heic" },
    { name: "vacio.png", size: 0, type: "image/png" },
    { name: "enorme.pdf", size: MAX_DOCUMENT_BYTES + 1, type: "application/pdf" },
    { name: "instalador.exe", size: 2000, type: "application/x-msdownload" }
  ];
  const { accepted, rejected } = screenFiles(files);
  assert.deepEqual(
    accepted.map((f) => f.name),
    ["biometria.pdf", "rx.JPG"]
  );
  assert.deepEqual(
    rejected.map((r) => [r.file.name, r.reason]),
    [
      ["foto.heic", "solo se admiten PDF, PNG, JPG y WEBP"],
      ["vacio.png", "el archivo esta vacio"],
      ["enorme.pdf", "supera el limite de 20 MB"],
      ["instalador.exe", "solo se admiten PDF, PNG, JPG y WEBP"]
    ]
  );
});

test("formatea tamanos legibles", () => {
  assert.equal(formatBytes(900), "900 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});

test("agrupa por consulta, la mas reciente primero y lo suelto al final", () => {
  const groups = groupDocumentsByEncounter([
    doc("a", "e-old", "2026-01-01T00:00:00Z"),
    doc("b", null, null),
    doc("c", "e-new", "2026-09-01T00:00:00Z"),
    doc("d", "e-old", "2026-01-01T00:00:00Z")
  ]);
  assert.deepEqual(
    groups.map((g) => [g.encounterId, g.documents.map((d) => d.id)]),
    [
      ["e-new", ["c"]],
      ["e-old", ["a", "d"]],
      [null, ["b"]]
    ]
  );
});

test("en la consulta, sus propios documentos van primero", () => {
  const groups = groupDocumentsByEncounter(
    [doc("a", "e-old", "2026-01-01T00:00:00Z"), doc("c", "e-new", "2026-09-01T00:00:00Z")],
    "e-old"
  );
  assert.deepEqual(
    groups.map((g) => g.encounterId),
    ["e-old", "e-new"]
  );
});

test("sin documentos no hay grupos", () => {
  assert.deepEqual(groupDocumentsByEncounter([]), []);
});
