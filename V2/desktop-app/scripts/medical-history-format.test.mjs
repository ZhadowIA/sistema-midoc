import assert from "node:assert/strict";
import {
  formatMedicalHistoryForDisplay,
  flattenMedicalHistoryDisplayRows
} from "../src/medicalHistoryFormat.ts";

const raw = JSON.stringify({
  sex: "F",
  allergies: "Penicilina",
  identification: { apellidoPaterno: "Perez", municipio: "Monterrey" },
  emergencyContact: { nombre: "Ana", relacion: "madre" },
  familyHistory: {
    diabetes: { relatives: ["padre", "madre"] },
    cancer: { relatives: ["abuelaPaterna"], type: "mama" }
  },
  nonPathological: {
    leche: "7",
    alcohol: "no",
    tabaco: "si",
    tabacoCigarrosDia: "5",
    tenencia: "rentada"
  },
  pathological: {
    diabetico: "si",
    diabeticoDesde: "2018"
  }
});

const groups = formatMedicalHistoryForDisplay(raw);
assert.deepEqual(
  groups.map((group) => group.title),
  [
    "Datos generales",
    "Ficha de identificacion",
    "Contacto de emergencia",
    "Antecedentes heredo-familiares",
    "Antecedentes personales no patologicos",
    "Antecedentes personales patologicos"
  ],
  "muestra los grupos con datos, en orden del contrato"
);

const familyGroup = groups.find((group) => group.key === "familyHistory");
assert.deepEqual(
  familyGroup.rows,
  [
    { label: "Diabetes", value: "Padre, Madre" },
    { label: "Cancer", value: "Abuela paterna (mama)" }
  ],
  "heredo-familiares se muestra por padecimiento con sus parientes"
);

const rows = flattenMedicalHistoryDisplayRows(raw);
const byLabel = new Map(rows);
assert.equal(byLabel.get("Contacto de emergencia · Relacion con el contacto"), "Madre", "select muestra la etiqueta, no el value");
assert.equal(byLabel.get("Antecedentes personales no patologicos · Consume alcohol"), "No", "yesno se muestra como Si/No");
assert.equal(byLabel.get("Antecedentes personales no patologicos · Fuma"), "Si");
assert.equal(byLabel.get("Antecedentes personales no patologicos · Cigarros al dia"), "5");
assert.equal(byLabel.get("Antecedentes personales no patologicos · Tipo de vivienda"), "Rentada");
assert.equal(byLabel.get("Antecedentes personales patologicos · Es diabetico"), "Si");

assert.equal(
  rows.some(([label]) => /[a-z][A-Z]/.test(label)),
  false,
  "las claves tecnicas (camelCase) no deben saltar a la UI"
);

console.log("medical-history-format.test.mjs OK");
