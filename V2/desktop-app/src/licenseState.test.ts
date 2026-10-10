import assert from "node:assert/strict";
import test from "node:test";

import { activationReason, creditBalanceLine, creditBalanceTitle, isLicensed, licenseLine, type LicenseStatus } from "./licenseState.ts";

const valid: LicenseStatus = {
  state: "VALID",
  reason: null,
  holder_name: "Dra. Eva Soto",
  holder_license_number: "1234567",
  edition: "STANDARD",
  purchased_at: "2026-10-06",
  updates_until: "2027-10-06",
  updates_included: true,
  max_devices: 2
};

test("solo una licencia valida abre el espacio de trabajo", () => {
  assert.equal(isLicensed(valid), true);
  assert.equal(isLicensed({ ...valid, state: "INVALID" }), false);
  assert.equal(isLicensed({ ...valid, state: "MISSING" }), false);
  assert.equal(isLicensed(null), false);
});

test("la linea de licencia dice hasta cuando hay actualizaciones", () => {
  assert.match(licenseLine(valid), /^Licencia activa · actualizaciones hasta 6 oct 2027$/);
  assert.match(licenseLine({ ...valid, updates_included: false }), /incluidas hasta 6 oct 2027/);
  assert.equal(licenseLine({ ...valid, state: "MISSING" }), "");
});

test("el motivo de activacion prefiere el error del portal", () => {
  assert.equal(activationReason(valid, "Tu cuenta no tiene una licencia activa de MiDoc."), "Tu cuenta no tiene una licencia activa de MiDoc.");
  assert.equal(activationReason({ ...valid, state: "INVALID", reason: "La licencia guardada es de otro equipo." }, ""), "La licencia guardada es de otro equipo.");
  assert.match(activationReason(null, ""), /todavía no tiene licencia/);
});

test("el saldo de creditos se lee en singular y plural", () => {
  assert.equal(creditBalanceLine(30), "30 créditos de IA");
  assert.equal(creditBalanceLine(1), "1 crédito de IA");
  assert.equal(creditBalanceLine(0), "0 créditos de IA");
  assert.match(creditBalanceTitle(null), /Saldo de tu cuenta/);
});
