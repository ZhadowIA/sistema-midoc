import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// REGLAS_DESARROLLO.md §4.4: "Toda nueva tabla o campo se clasifica al
// disenarse: CLINICO (solo local/buzon), CONTACTO (nube minima) u OPERATIVO
// (segun residencia). La clasificacion se anota en el esquema." Hasta 2026-09
// la regla no tenia quien la hiciera cumplir y solo 13 de 51 modelos decian su
// clase. Esta prueba la vuelve verificable.

const CLASES = ["CLINICO", "CONTACTO", "OPERATIVO", "FACTURABLE"] as const;

function schema(): string {
  return readFileSync(resolve(process.cwd(), "prisma", "schema.prisma"), "utf8");
}

/** Cada modelo con la linea `/// Clase: ...` que lo precede, si existe. */
function modelosConClase(): Array<{ modelo: string; clase: string | null }> {
  const lineas = schema().split(/\r?\n/);
  const resultado: Array<{ modelo: string; clase: string | null }> = [];

  lineas.forEach((linea, indice) => {
    const encontrado = /^model (\w+) \{/.exec(linea);
    if (!encontrado) {
      return;
    }

    const anterior = lineas[indice - 1]?.trim() ?? "";
    const anotacion = /^\/\/\/ Clase: (\w+)/.exec(anterior);
    resultado.push({ modelo: encontrado[1], clase: anotacion ? anotacion[1] : null });
  });

  return resultado;
}

describe("clasificacion de datos del esquema (REGLAS §4.4)", () => {
  it("todos los modelos declaran su clase", () => {
    const sinClase = modelosConClase()
      .filter((entrada) => entrada.clase === null)
      .map((entrada) => entrada.modelo);

    expect(sinClase, "modelos sin `/// Clase:` encima").toEqual([]);
  });

  it("la clase declarada es una de las cuatro del vocabulario", () => {
    const invalidas = modelosConClase().filter(
      (entrada) => entrada.clase !== null && !CLASES.includes(entrada.clase as (typeof CLASES)[number])
    );

    expect(invalidas).toEqual([]);
  });

  it("cubre el esquema completo, no una parte", () => {
    const modelos = modelosConClase();

    expect(modelos.length).toBeGreaterThanOrEqual(51);
    expect(new Set(modelos.map((entrada) => entrada.modelo)).size).toBe(modelos.length);
  });

  it("el vocabulario esta documentado en el propio esquema", () => {
    // Sin la leyenda, `/// Clase: OPERATIVO` no le dice nada a quien llega nuevo.
    const texto = schema();

    for (const clase of CLASES) {
      expect(texto).toContain(clase);
    }
    expect(texto).toContain("REGLAS_DESARROLLO.md §4.4");
  });
});
