import assert from "node:assert/strict";
import test from "node:test";
import { confirmationText, contraindicationTitle, type ContraindicationAlert } from "./contraindicationsModel.ts";

const alert: ContraindicationAlert = {
  drug: "Ibuprofeno",
  line: "Ibuprofeno 400 mg cada 8 h",
  condition: "Úlcera gástrica",
  diagnosis_code: "K25.9",
  diagnosis_name: "ÚLCERA GÁSTRICA",
  severity: "CONTRAINDICADA",
  recommendation: "Evitar AINE",
  source: "Prueba",
  current_encounter: false
};

test("el titulo dice de que consulta viene el diagnostico", () => {
  assert.equal(contraindicationTitle(alert), "Ibuprofeno — Úlcera gástrica (K25.9, diagnóstico de una consulta anterior)");
  assert.equal(
    contraindicationTitle({ ...alert, current_encounter: true }),
    "Ibuprofeno — Úlcera gástrica (K25.9, diagnóstico de esta consulta)"
  );
});

test("la confirmacion lista las alertas y avisa que queda registrada", () => {
  const one = confirmationText({ alerts: [{ key: "a", text: "Alergia: X" }], fingerprint: "f", acknowledged: false });
  assert.match(one, /^La receta tiene una alerta grave:/);
  assert.match(one, /• Alergia: X/);
  assert.match(one, /quedará registrada/);
  const two = confirmationText({
    alerts: [
      { key: "a", text: "A" },
      { key: "b", text: "B" }
    ],
    fingerprint: "f",
    acknowledged: false
  });
  assert.match(two, /^La receta tiene 2 alertas graves:/);
});
