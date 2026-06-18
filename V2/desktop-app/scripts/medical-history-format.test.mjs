import assert from "node:assert/strict";
import {
  formatMedicalHistoryForDisplay,
  flattenMedicalHistoryDisplayRows
} from "../src/medicalHistoryFormat.ts";

const raw = JSON.stringify({
  sex: "M",
  identification: {
    gender: "Hombre",
    maritalStatus: "Soltero",
    occupation: "Estudiante",
    bloodType: "O+"
  },
  nonPathological: {
    actividadFisica: "Gimnasio y Volleyball",
    alimentacion: "Regular",
    sueno: "Entre 6 a 8 horas diarias"
  },
  pathological: {
    enfCronicas: "Gastritis"
  }
});

const groups = formatMedicalHistoryForDisplay(raw);
assert.deepEqual(
  groups.map((group) => group.title),
  [
    "Datos generales",
    "Identificacion",
    "Antecedentes personales no patologicos",
    "Antecedentes personales patologicos"
  ],
  "muestra los mismos grupos del formulario del paciente"
);

const rows = flattenMedicalHistoryDisplayRows(raw);
assert.deepEqual(
  rows.map(([label]) => label),
  [
    "Sexo biologico",
    "Identificacion · Genero",
    "Identificacion · Estado civil",
    "Identificacion · Ocupacion",
    "Identificacion · Grupo sanguineo",
    "Antecedentes personales no patologicos · Actividad fisica",
    "Antecedentes personales no patologicos · Alimentacion",
    "Antecedentes personales no patologicos · Sueno",
    "Antecedentes personales patologicos · Enfermedades cronicas"
  ],
  "no muestra claves tecnicas en ingles"
);

assert.equal(
  rows.some(([label]) => label.includes("Gender") || label.includes("Blood Type")),
  false,
  "las etiquetas tecnicas no deben saltar a la UI"
);
