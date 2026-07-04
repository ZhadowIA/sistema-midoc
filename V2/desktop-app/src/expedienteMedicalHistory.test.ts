import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const expedienteSource = readFileSync(new URL("./Expediente.tsx", import.meta.url), "utf8");

test("el expediente carga y presenta la historia clínica completa igual que la consulta", () => {
  assert.match(expedienteSource, /call<PatientMedicalHistoryVersion \| null>\("get_patient_medical_history"/);
  assert.match(
    expedienteSource,
    /formatMedicalHistoryForDisplay\(\s*patientMedicalHistory\?\.payload_json \?\? null\s*\)/
  );
  assert.match(expedienteSource, /<MedicalHistoryGroups groups=\{medicalHistoryGroups\} \/>/);
});
