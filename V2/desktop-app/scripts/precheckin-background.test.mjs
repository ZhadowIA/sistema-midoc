import assert from "node:assert/strict";
import {
  buildBackgroundReview,
  extractPrecheckinBackground
} from "../src/precheckinBackground.ts";

const medicalHistory = JSON.stringify({
  allergies: "Penicilina",
  familyHistory: {
    diabetes: { relatives: ["padre"] }
  },
  pathological: {
    cirugia: "no",
    diabetico: "si",
    diabeticoDesde: "2018"
  }
});

assert.deepEqual(
  extractPrecheckinBackground(medicalHistory),
  {
    allergies: "Penicilina",
    medical_background:
      "Intervenido quirurgicamente: No\nEs diabetico: Si\nDesde cuando: 2018",
    family_background: "Diabetes: Padre"
  },
  "extrae alergias, patologicos y heredo-familiares en texto legible"
);

// La preconsulta IA (conversation) no es historia clinica: no se extrae.
assert.equal(
  extractPrecheckinBackground(
    JSON.stringify({ motivo: "tos", conversation: [{ question: "q", answer: "a" }] })
  ),
  null,
  "el resultado de la preconsulta IA no alimenta los antecedentes"
);

const review = buildBackgroundReview(
  {
    allergies: "Sin alergias conocidas",
    medical_background: "Hipertension en tratamiento.",
    family_background: "Padre con DM2.",
    birth_date: ""
  },
  medicalHistory
);

assert.equal(review?.hasDiscrepancies, true, "detecta discrepancias contra antecedentes previos");
assert.equal(review?.incoming.allergies, "Penicilina");
assert.equal(review?.fields.length, 3, "muestra alergias, antecedentes y familiares");

const emptyReview = buildBackgroundReview(
  { allergies: "", medical_background: "", family_background: "", birth_date: "" },
  medicalHistory
);
assert.equal(
  emptyReview?.hasDiscrepancies,
  false,
  "si no habia antecedentes previos, ofrece importar sin marcar discrepancia"
);

console.log("precheckin-background.test.mjs OK");
