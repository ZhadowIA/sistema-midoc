import assert from "node:assert/strict";
import { test } from "node:test";

import { isDirty, toDraft, toInput, validateDraft, type Prescriber } from "./doctorDataModel.ts";

const saved: Prescriber = {
  professionalName: "Dra. Eva Soto",
  licenseNumber: "1234567",
  degreeInstitution: null,
  specialtyTitle: null,
  specialtyLicenseNumber: null,
  addressLine1: "Av. Juárez 100",
  addressLine2: null,
  city: "Chihuahua",
  state: "Chihuahua",
  postalCode: "31000",
  updatedAt: "2026-10-10T12:00:00.000Z"
};

test("el borrador muestra vacios como cadena vacia y detecta cambios reales", () => {
  const draft = toDraft(saved);
  assert.equal(draft.degreeInstitution, "");
  assert.equal(isDirty(draft, saved), false);
  assert.equal(isDirty({ ...draft, degreeInstitution: "UACH" }, saved), true);
  // Espacios de mas no cuentan como cambio.
  assert.equal(isDirty({ ...draft, city: " Chihuahua " }, saved), false);
});

test("valida lo que el portal exige antes de enviar", () => {
  const draft = toDraft(saved);
  assert.deepEqual(validateDraft(draft), []);
  assert.deepEqual(validateDraft({ ...draft, professionalName: " " }), ["Captura tu nombre profesional."]);
  assert.deepEqual(validateDraft({ ...draft, specialtyTitle: "Pediatría" }), [
    "La especialidad requiere su cédula de especialidad."
  ]);
});

test("el envio lleva la version leida y manda null en lo vacio", () => {
  const input = toInput({ ...toDraft(saved), degreeInstitution: "  UACH  ", addressLine2: "  " }, saved.updatedAt);
  assert.equal(input.expectedUpdatedAt, "2026-10-10T12:00:00.000Z");
  assert.equal(input.degreeInstitution, "UACH");
  assert.equal(input.addressLine2, null);
  assert.equal(input.specialtyTitle, null);
});
