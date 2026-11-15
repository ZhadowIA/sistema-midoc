import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// REGLAS_DESARROLLO.md §4.4: toda tabla se clasifica al disenarse (CLINICO,
// CONTACTO u OPERATIVO) y la clasificacion se anota en el esquema. Esta prueba
// la vuelve verificable y vigila la residencia: el contenido clinico solo puede
// estar en la nube cifrado y en transito, en los modelos del buzon.

const CLASES = ["CLINICO", "CONTACTO", "OPERATIVO"] as const;

/**
 * Unicos modelos que pueden ser CLINICO: el buzon cifrado que se purga cuando
 * la app confirma. Agregar otro es una decision de residencia, no de codigo
 * (el expediente en la nube ya se retiro una vez, PR #43).
 */
const BUZON_EN_TRANSITO = ["AuthorizedSummary", "MailboxDocument", "PrecheckinSubmission", "SyncEvent"];

function schema(): string {
  return readFileSync(resolve(process.cwd(), "prisma", "schema.prisma"), "utf8");
}

interface Modelo {
  nombre: string;
  clase: string | null;
  cuerpo: string;
}

/** Cada modelo con la clase de la linea `/// Clase:` que lo precede. */
function modelos(): Modelo[] {
  const lineas = schema().split(/\r?\n/);
  const resultado: Modelo[] = [];
  lineas.forEach((linea, indice) => {
    const encontrado = /^model (\w+) \{/.exec(linea);
    if (!encontrado) return;
    const anotacion = /^\/\/\/ Clase: (\w+) - \S/.exec(lineas[indice - 1]?.trim() ?? "");
    const fin = lineas.findIndex((otra, i) => i > indice && otra.trim() === "}");
    resultado.push({
      nombre: encontrado[1],
      clase: anotacion ? anotacion[1] : null,
      cuerpo: lineas.slice(indice + 1, fin).join("\n")
    });
  });
  return resultado;
}

describe("clasificacion de datos del esquema (REGLAS §4.4)", () => {
  it("todos los modelos declaran su clase con un motivo", () => {
    const sinClase = modelos()
      .filter((modelo) => modelo.clase === null)
      .map((modelo) => modelo.nombre);
    expect(sinClase, "modelos sin `/// Clase: X - motivo` encima").toEqual([]);
  });

  it("la clase es una del vocabulario de la regla", () => {
    const invalidas = modelos().filter(
      (modelo) => modelo.clase !== null && !CLASES.includes(modelo.clase as (typeof CLASES)[number])
    );
    expect(invalidas.map((modelo) => `${modelo.nombre}: ${modelo.clase}`)).toEqual([]);
  });

  it("solo el buzon en transito es CLINICO", () => {
    const clinicos = modelos()
      .filter((modelo) => modelo.clase === "CLINICO")
      .map((modelo) => modelo.nombre)
      .sort();
    expect(clinicos, "un modelo CLINICO nuevo en la nube contradice la residencia").toEqual(BUZON_EN_TRANSITO);
  });

  it("los modelos CLINICO registran su purga", () => {
    for (const modelo of modelos().filter((m) => m.clase === "CLINICO")) {
      expect(modelo.cuerpo, `${modelo.nombre} sin purgedAt`).toMatch(/^\s*purgedAt\s+DateTime\?/m);
    }
  });

  it("el vocabulario esta explicado en el propio esquema", () => {
    const texto = schema();
    expect(texto).toContain("REGLAS_DESARROLLO.md §4.4");
    for (const clase of CLASES) {
      expect(texto).toMatch(new RegExp(`^//\\s+${clase}\\s+- `, "m"));
    }
  });
});
