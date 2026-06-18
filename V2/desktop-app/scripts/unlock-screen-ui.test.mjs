import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const unlockStart = source.indexOf("function UnlockScreen");
const unlockEnd = source.indexOf("function LinkAccountForm");

assert.ok(unlockStart >= 0 && unlockEnd > unlockStart, "UnlockScreen debe existir en App.tsx");

const unlockScreen = source.slice(unlockStart, unlockEnd);

assert.ok(
  unlockScreen.includes("profile-card-grid"),
  "la pantalla inicial debe mostrar los medicos como tarjetas"
);
assert.ok(
  unlockScreen.includes("profile-add-card"),
  "la pantalla inicial debe incluir una tarjeta para añadir medico"
);
assert.ok(
  unlockScreen.includes("selectedProfile"),
  "al elegir un medico debe abrirse una pantalla dedicada para la frase de seguridad"
);
assert.ok(
  unlockScreen.includes("Volver"),
  "la pantalla de frase de seguridad debe permitir volver a elegir medico"
);
assert.ok(!unlockScreen.includes("<select"), "la seleccion de medico ya no debe usar select");
