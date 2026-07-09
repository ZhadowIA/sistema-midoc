import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyProposals,
  describeProposal,
  parseDentalDictation,
  type DictationProposal
} from "./dentalDictation.ts";
import { EMPTY_DENTAL_PAYLOAD } from "./clinicalProfiles.ts";

function recognized(proposals: DictationProposal[]): DictationProposal[] {
  return proposals.filter((proposal) => proposal.kind !== "UNRECOGNIZED");
}

test("dictado clasico con comas: caries por superficie, restauracion y ausente", () => {
  const proposals = parseDentalDictation("18 caries oclusal, 17 amalgama, 16 ausente");
  assert.deepEqual(
    proposals.map((p) => ({ ...p, source: undefined })),
    [
      { kind: "SURFACE_STATUS", toothId: "18", faces: ["O"], status: "CARIES", source: undefined },
      { kind: "TOOTH_STATUS", toothId: "17", status: "RESTORED", source: undefined },
      { kind: "TOOTH_STATUS", toothId: "16", status: "MISSING", source: undefined }
    ]
  );
});

test("sin comas (como sale de Whisper) segmenta por numero de pieza", () => {
  const proposals = parseDentalDictation("18 caries oclusal 17 amalgama 16 ausente");
  assert.equal(proposals.length, 3);
  assert.equal(proposals[0].kind, "SURFACE_STATUS");
  assert.equal(proposals[1].kind, "TOOTH_STATUS");
  assert.equal(proposals[2].kind, "TOOTH_STATUS");
});

test("varias superficies para un estado y varios hallazgos por pieza", () => {
  const proposals = parseDentalDictation("pieza 24 resina mesial y distal, caries oclusal");
  assert.deepEqual(recognized(proposals).map((p) => ({ ...p, source: undefined })), [
    {
      kind: "SURFACE_STATUS",
      toothId: "24",
      faces: ["M", "D"],
      status: "RESTORED",
      source: undefined
    },
    { kind: "SURFACE_STATUS", toothId: "24", faces: ["O"], status: "CARIES", source: undefined }
  ]);
});

test("superficies compuestas: mesio-oclusal y siglas MOD", () => {
  const compound = parseDentalDictation("26 caries mesio-oclusal");
  assert.deepEqual((compound[0] as { faces: string[] }).faces, ["M", "O"]);

  const mod = parseDentalDictation("36 resina MOD");
  assert.deepEqual((mod[0] as { faces: string[] }).faces, ["M", "O", "D"]);
});

test("numeros hablados: dieciocho, veintiuno y treinta y ocho", () => {
  const proposals = parseDentalDictation(
    "dieciocho caries oclusal, veintiuno corona, treinta y ocho extraccion indicada"
  );
  assert.deepEqual(proposals.map((p) => ({ kind: p.kind, toothId: (p as { toothId?: string }).toothId })), [
    { kind: "SURFACE_STATUS", toothId: "18" },
    { kind: "TOOTH_STATUS", toothId: "21" },
    { kind: "TOOTH_STATUS", toothId: "38" }
  ]);
  assert.equal((proposals[2] as { status: string }).status, "EXTRACTION_INDICATED");
});

test("estados de pieza completa: implante, endodoncia, extraccion indicada", () => {
  const proposals = parseDentalDictation("46 implante, 45 endodoncia, 44 para extraccion");
  assert.deepEqual(
    proposals.map((p) => (p as { status?: string }).status),
    ["IMPLANT", "ROOT_CANAL", "EXTRACTION_INDICATED"]
  );
});

test("denticion temporal se reconoce: 55 sellador oclusal", () => {
  const proposals = parseDentalDictation("55 sellador oclusal");
  assert.deepEqual(proposals.map((p) => ({ ...p, source: undefined })), [
    { kind: "SURFACE_STATUS", toothId: "55", faces: ["O"], status: "SEALANT", source: undefined }
  ]);
});

test("periodontograma dictado: bolsas de seis sitios, movilidad y furca", () => {
  const proposals = parseDentalDictation("16 bolsas 3 2 3 4 3 4 movilidad 2 furca 1");
  assert.deepEqual(proposals.map((p) => ({ ...p, source: undefined })), [
    {
      kind: "POCKET_DEPTHS",
      toothId: "16",
      depths: [3, 2, 3, 4, 3, 4],
      source: undefined
    },
    { kind: "MOBILITY", toothId: "16", value: 2, source: undefined },
    { kind: "FURCATION", toothId: "16", value: 1, source: undefined }
  ]);
});

test("bolsas con guiones y numeros hablados", () => {
  const proposals = parseDentalDictation("21 bolsas 3-2-3 4-3-4, 22 bolsas tres dos tres cuatro tres cuatro");
  assert.equal(proposals.length, 2);
  assert.deepEqual((proposals[0] as { depths: number[] }).depths, [3, 2, 3, 4, 3, 4]);
  assert.deepEqual((proposals[1] as { depths: number[] }).depths, [3, 2, 3, 4, 3, 4]);
});

test("los valores de bolsas no abren segmentos de pieza", () => {
  // 15 y 12 son numeros FDI validos pero aqui son profundidades... no: son
  // valores 0-15. "bolsas 5 4 15 12 3 2" debe quedarse en la pieza 16.
  const proposals = parseDentalDictation("16 bolsas 5 4 15 12 3 2, 17 caries");
  assert.equal(proposals.length, 2);
  assert.equal((proposals[0] as { toothId: string }).toothId, "16");
  assert.deepEqual((proposals[0] as { depths: number[] }).depths, [5, 4, 15, 12, 3, 2]);
  assert.equal((proposals[1] as { toothId: string }).toothId, "17");
});

test("lo que no se entiende queda marcado, no se inventa", () => {
  const unrecognized = parseDentalDictation("mmm el paciente refiere dolor");
  assert.equal(unrecognized.length, 1);
  assert.equal(unrecognized[0].kind, "UNRECOGNIZED");

  const mixed = parseDentalDictation("hola doctor 18 caries oclusal");
  assert.equal(mixed[0].kind, "UNRECOGNIZED");
  assert.equal(mixed[1].kind, "SURFACE_STATUS");

  const segmentNoise = parseDentalDictation("18 murmullo inaudible");
  assert.equal(segmentNoise.length, 1);
  assert.equal(segmentNoise[0].kind, "UNRECOGNIZED");
  assert.match(segmentNoise[0].source, /18/);

  assert.deepEqual(parseDentalDictation("   "), []);
});

test("applyProposals marca odontograma y periodontograma sin mutar el original", () => {
  const proposals = parseDentalDictation(
    "18 caries oclusal, 17 amalgama, 16 ausente, 16 bolsas 3 2 3 4 3 4 movilidad 2"
  );
  const before = structuredClone(EMPTY_DENTAL_PAYLOAD);
  const after = applyProposals(EMPTY_DENTAL_PAYLOAD, proposals);

  assert.deepEqual(EMPTY_DENTAL_PAYLOAD, before);
  assert.equal(after.odontogram["18"].surfaces.O, "CARIES");
  assert.equal(after.odontogram["17"].status, "RESTORED");
  assert.equal(after.odontogram["16"].status, "MISSING");
  assert.deepEqual(after.periodontogram["16"].pocketDepth, [3, 2, 3, 4, 3, 4]);
  assert.equal(after.periodontogram["16"].mobility, 2);
});

test("applyProposals conserva lo ya capturado en la pieza", () => {
  const payload = {
    ...EMPTY_DENTAL_PAYLOAD,
    odontogram: {
      "18": { status: "HEALTHY" as const, surfaces: { M: "RESTORED" as const }, notes: "previa" }
    }
  };
  const after = applyProposals(payload, parseDentalDictation("18 caries oclusal"));
  assert.equal(after.odontogram["18"].surfaces.M, "RESTORED");
  assert.equal(after.odontogram["18"].surfaces.O, "CARIES");
  assert.equal(after.odontogram["18"].notes, "previa");
});

test("describeProposal resume cada propuesta en espanol", () => {
  const [caries, corona, bolsas] = parseDentalDictation(
    "18 caries mesio-oclusal, 21 corona, 16 bolsas 3 2 3 4 3 4"
  );
  assert.equal(describeProposal(caries), "Pieza 18: caries en mesial, oclusal");
  assert.equal(describeProposal(corona), "Pieza 21: corona");
  assert.equal(describeProposal(bolsas), "Pieza 16: bolsas 3-2-3-4-3-4");
  assert.match(describeProposal({ kind: "UNRECOGNIZED", source: "xyz" }), /Sin interpretar/);
});
