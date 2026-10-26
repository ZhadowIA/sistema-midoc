import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysBetween,
  htmlText,
  isCnisUpdate,
  isoDate,
  medicineKeys,
  mergeUpdates,
  otherEditions,
  parseDayIndex,
  pendingUpdates,
  validateState,
  type CnisUpdate,
  type UpdatesState
} from "./updates.ts";

// Fragmento con el acomodo real del indice diario del DOF.
const DAY = `
<a href="index.php?year=2026&amp;month=08&amp;day=19&amp;edicion=VES">Vespertina</a>
<td><a href="/nota_detalle.php?codigo=5796643&amp;fecha=19/08/2026" class="enlaces">
    Acuerdo por el que se actualiza el Compendio Nacional de Insumos para la Salud versi&oacute;n 2025, publicado el 26 de abril de 2025.   </a></td>
<td><a href="/nota_detalle.php?codigo=5796650&amp;fecha=19/08/2026" class="enlaces">Aviso de otra cosa</a></td>`;

test("lee las notas del indice diario y sus otras ediciones", () => {
  const notes = parseDayIndex(DAY);
  assert.equal(notes.length, 2);
  assert.deepEqual(notes[0], {
    codigo: "5796643",
    fecha: "19/08/2026",
    title: "Acuerdo por el que se actualiza el Compendio Nacional de Insumos para la Salud versión 2025, publicado el 26 de abril de 2025."
  });
  assert.equal(isCnisUpdate(notes[0]), true);
  assert.equal(isCnisUpdate(notes[1]), false);
  assert.deepEqual(otherEditions(DAY), ["VES"]);
});

test("extrae solo las claves de medicamento de un acuerdo", () => {
  const note = `<style>.x{}</style><p>Grupo 13</p><td>010.000.2262.00</td><td>020.000.6521.00</td>
    <td>080.784.0525</td><td>060.066.0971.00</td><td>010.000.2262.00</td><td>040.000.2106.00</td>`;
  assert.deepEqual(medicineKeys(note), ["010.000.2262.00", "020.000.6521.00", "040.000.2106.00"]);
  assert.equal(htmlText("Versi&oacute;n&nbsp;2025 &#193;"), "Versión 2025 Á");
});

test("fechas del DOF y dias a revisar", () => {
  assert.equal(isoDate("19/08/2026"), "2026-08-19");
  assert.deepEqual(daysBetween("2026-02-27", "2026-03-02"), ["2026-02-28", "2026-03-01", "2026-03-02"]);
  assert.deepEqual(daysBetween("2026-03-02", "2026-03-02"), []);
});

const update = (codigo: string, date: string, status: CnisUpdate["status"] = "pendiente"): CnisUpdate => ({
  date,
  codigo,
  title: "Acuerdo",
  url: `https://dof.gob.mx/nota_detalle.php?codigo=${codigo}`,
  medicineKeys: [],
  status,
  reviewedBy: status === "pendiente" ? null : "Farmaceutico piloto",
  notes: ""
});

test("agrega solo lo nuevo y conserva lo ya revisado", () => {
  const state: UpdatesState = {
    edition: "2025-04-26",
    checkedThrough: "2026-06-30",
    updates: [update("1", "2026-06-11", "aplicada")]
  };
  const next = mergeUpdates(
    state,
    [update("1", "2026-06-11"), update("2", "2026-08-19"), update("2", "2026-08-19")],
    "2026-10-24"
  );
  assert.equal(next.checkedThrough, "2026-10-24");
  assert.deepEqual(next.updates.map((u) => [u.codigo, u.status]), [
    ["1", "aplicada"],
    ["2", "pendiente"]
  ]);
  assert.deepEqual(pendingUpdates(next).map((u) => u.codigo), ["2"]);
  assert.equal(mergeUpdates(next, [], "2026-01-01").checkedThrough, "2026-10-24", "nunca retrocede");
});

test("una actualizacion cerrada exige quien la reviso", () => {
  const bad: UpdatesState = {
    edition: "2025-04-26",
    checkedThrough: "2026-10-24",
    updates: [{ ...update("1", "2026-06-11"), status: "aplicada", reviewedBy: null }]
  };
  assert.throws(() => validateState(bad), /sin quien la reviso/);
});
