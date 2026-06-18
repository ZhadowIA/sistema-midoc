import assert from "node:assert/strict";
import {
  buildBackgroundReview,
  extractPrecheckinBackground
} from "../src/precheckinBackground.ts";

const medicalHistory = JSON.stringify({
  allergies: "Penicilina",
  currentMedications: "Losartan 50 mg",
  familyHistory: {
    diabetes: "Padre con DM2"
  },
  nonPathological: {
    actividadFisica: "Gimnasio y Volleyball",
    alimentacion: "Regular"
  },
  pathological: {
    enfCronicas: "Hipertension arterial",
    cirugias: "Apendicectomia"
  }
});

assert.deepEqual(
  extractPrecheckinBackground(medicalHistory),
  {
    allergies: "Penicilina",
    medical_background:
      "Enfermedades cronicas: Hipertension arterial\nCirugias: Apendicectomia",
    family_background: "Diabetes: Padre con DM2"
  },
  "extrae solo los campos equivalentes a los antecedentes editables"
);

const review = buildBackgroundReview(
  {
    allergies: "Sin alergias conocidas",
    medical_background: "Hipertension en tratamiento (losartan).",
    family_background: "Padre con DM2.",
    birth_date: ""
  },
  medicalHistory
);

assert.equal(review?.hasDiscrepancies, true, "detecta discrepancias contra antecedentes previos");
assert.equal(review?.incoming.allergies, "Penicilina");
assert.equal(review?.fields.length, 3, "muestra ambos valores para alergias y antecedentes");

const emptyReview = buildBackgroundReview(
  {
    allergies: "",
    medical_background: "",
    family_background: "",
    birth_date: ""
  },
  medicalHistory
);

assert.equal(
  emptyReview?.hasDiscrepancies,
  false,
  "si no habia antecedentes previos, ofrece importar sin marcar discrepancia"
);
