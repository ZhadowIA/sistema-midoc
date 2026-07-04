import { describe, expect, it } from "vitest";

import {
  FAMILY_CONDITIONS,
  MEDICAL_HISTORY_GROUPS,
  groupFields,
  medicalHistorySchema,
  patientGroups
} from "../../src/lib/medical-history";

describe("contrato de historia clinica (paso 19, rebanada 13)", () => {
  it("acepta un payload con secciones, sub-preguntas y heredo-familiares", () => {
    const parsed = medicalHistorySchema.parse({
      sex: "F",
      allergies: "Penicilina",
      identification: { apellidoPaterno: "Perez", municipio: "Monterrey" },
      emergencyContact: { nombre: "Ana", telefono: "8181818181", relacion: "madre" },
      familyHistory: {
        diabetes: { relatives: ["padre", "madre"] },
        cancer: { relatives: ["abuelaPaterna"], type: "mama" }
      },
      nonPathological: { tabaco: "si", tabacoCigarrosDia: "5" },
      pathological: { diabetico: "si", diabeticoDesde: "2018" }
    });
    expect(parsed.allergies).toBe("Penicilina");
    expect((parsed.familyHistory as Record<string, unknown>).diabetes).toEqual({
      relatives: ["padre", "madre"]
    });
  });

  it("rechaza un pariente desconocido en heredo-familiares", () => {
    expect(() =>
      medicalHistorySchema.parse({ familyHistory: { diabetes: { relatives: ["primo"] } } })
    ).toThrow();
  });

  it("rechaza texto que excede el limite por campo", () => {
    expect(() =>
      medicalHistorySchema.parse({ pathological: { cirugiaDeQue: "x".repeat(2001) } })
    ).toThrow();
  });

  it("patientGroups omite el interrogatorio del medico y condiciona gineco por sexo", () => {
    const female = patientGroups("F").map((group) => group.key);
    const male = patientGroups("M").map((group) => group.key);
    expect(female).not.toContain("systemsReview");
    expect(female).toContain("gyneco");
    expect(male).not.toContain("gyneco");
  });

  it("toda condicion showWhen apunta a un campo existente del mismo grupo", () => {
    for (const group of MEDICAL_HISTORY_GROUPS) {
      const keys = new Set(groupFields(group).map((field) => field.key));
      for (const field of groupFields(group)) {
        if (field.showWhen) expect(keys.has(field.showWhen.field)).toBe(true);
      }
    }
  });

  it("el esquema cubre todos los grupos del cuestionario (guardia anti-drift)", () => {
    // El esquema declara los grupos con llaves explicitas para que el tipo
    // inferido las conozca; esta prueba evita que un grupo nuevo quede fuera.
    const schemaKeys = Object.keys(medicalHistorySchema.shape);
    for (const group of MEDICAL_HISTORY_GROUPS) {
      expect(schemaKeys).toContain(group.key);
    }
  });

  it("define cancer como padecimiento con tipo en heredo-familiares", () => {
    const cancer = FAMILY_CONDITIONS.find((condition) => condition.key === "cancer");
    expect(cancer?.hasType).toBe(true);
  });
});
