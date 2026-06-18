import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const patientResolution = readFileSync(
  new URL("../src/PatientResolution.tsx", import.meta.url),
  "utf8"
);
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

assert.ok(
  patientResolution.includes("Iniciar consulta"),
  "cada candidato similar debe ofrecer iniciar consulta"
);
assert.ok(
  patientResolution.includes("Ir al expediente"),
  "cada candidato similar debe ofrecer abrir expediente"
);
assert.ok(
  patientResolution.includes("No encontramos expedientes parecidos"),
  "si no hay similitudes debe explicar que se puede crear un paciente nuevo"
);
assert.ok(
  app.includes('role="dialog"'),
  "la resolucion de paciente desde agenda debe mostrarse en una ventana modal"
);
assert.ok(
  /\.modal-backdrop\s*{[^}]*position:\s*fixed;[^}]*place-items:\s*center;/s.test(css),
  "el fondo modal debe fijarse a la ventana y centrar el dialogo"
);
assert.ok(
  /\.modal-shell\s*{[^}]*max-height:[^;]+;[^}]*overflow:\s*auto;/s.test(css),
  "el dialogo modal debe limitar su altura y permitir scroll interno"
);
