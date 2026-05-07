import assert from "node:assert/strict";
import { buildLongitudinalSummary } from "../../lib/longitudinalSummary.ts";
import { runSuite } from "../testHarness.ts";

const BASE_DATE = new Date("2026-01-10T10:00:00Z");
const LATER_DATE = new Date("2026-02-15T10:00:00Z");

function makeEncounter(overrides: Record<string, unknown> = {}) {
  return {
    id: "enc-1",
    openedAt: BASE_DATE,
    appointment: null,
    encounterHistory: null,
    clinicalNote: null,
    ...overrides,
  };
}

export async function runLongitudinalSummaryUnitTests() {
  await runSuite("Unit: longitudinalSummary (Bloque 11.1)", [
    {
      name: "retorna array vacío para lista de encuentros vacía",
      run: () => {
        const result = buildLongitudinalSummary([]);
        assert.deepEqual(result, []);
      },
    },
    {
      name: "usa la fecha de appointment.startTime si existe",
      run: () => {
        const enc = makeEncounter({
          appointment: { startTime: LATER_DATE },
        });
        const [entry] = buildLongitudinalSummary([enc]);
        assert.equal(entry.date, LATER_DATE.toISOString());
      },
    },
    {
      name: "cae a openedAt si no hay appointment",
      run: () => {
        const enc = makeEncounter({ appointment: null });
        const [entry] = buildLongitudinalSummary([enc]);
        assert.equal(entry.date, BASE_DATE.toISOString());
      },
    },
    {
      name: "extrae chiefComplaint del payload de encounterHistory",
      run: () => {
        const enc = makeEncounter({
          encounterHistory: {
            payload: { chiefComplaint: "Dolor de cabeza", assessment: [] },
            completionPct: 50,
          },
        });
        const [entry] = buildLongitudinalSummary([enc]);
        assert.equal(entry.chiefComplaint, "Dolor de cabeza");
      },
    },
    {
      name: "extrae diagnósticos del array assessment del payload",
      run: () => {
        const enc = makeEncounter({
          encounterHistory: {
            payload: {
              chiefComplaint: "Tos",
              assessment: [
                { diagnosis: "Faringitis viral", probabilityPct: 70 },
                { diagnosis: "Rinitis alérgica" },
              ],
            },
            completionPct: 80,
          },
        });
        const [entry] = buildLongitudinalSummary([enc]);
        assert.deepEqual(entry.assessmentDiagnoses, ["Faringitis viral", "Rinitis alérgica"]);
      },
    },
    {
      name: "cae a soapAssessment si no hay diagnósticos en payload",
      run: () => {
        const enc = makeEncounter({
          clinicalNote: {
            subjective: "Paciente refiere tos",
            objective: null,
            assessment: "Bronquitis aguda",
            plan: "Reposo",
            signedAt: new Date(),
          },
        });
        const [entry] = buildLongitudinalSummary([enc]);
        assert.ok(
          entry.assessmentDiagnoses.includes("Bronquitis aguda") ||
          entry.soapAssessment === "Bronquitis aguda",
        );
      },
    },
    {
      name: "marca signed=true cuando clinicalNote.signedAt existe",
      run: () => {
        const enc = makeEncounter({
          clinicalNote: {
            subjective: null, objective: null, assessment: null, plan: null,
            signedAt: new Date(),
          },
        });
        const [entry] = buildLongitudinalSummary([enc]);
        assert.equal(entry.signed, true);
      },
    },
    {
      name: "marca signed=false cuando clinicalNote es null",
      run: () => {
        const enc = makeEncounter({ clinicalNote: null });
        const [entry] = buildLongitudinalSummary([enc]);
        assert.equal(entry.signed, false);
      },
    },
    {
      name: "preserva el orden del array de entrada",
      run: () => {
        const e1 = makeEncounter({ id: "enc-a", openedAt: LATER_DATE });
        const e2 = makeEncounter({ id: "enc-b", openedAt: BASE_DATE });
        const result = buildLongitudinalSummary([e1, e2]);
        assert.equal(result[0].encounterId, "enc-a");
        assert.equal(result[1].encounterId, "enc-b");
      },
    },
    {
      name: "completionPct es 0 si no hay encounterHistory",
      run: () => {
        const enc = makeEncounter({ encounterHistory: null });
        const [entry] = buildLongitudinalSummary([enc]);
        assert.equal(entry.completionPct, 0);
      },
    },
  ]);
}
