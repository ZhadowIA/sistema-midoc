import { describe, expect, it } from "vitest";

import {
  assertPasswordConfirmation,
  normalizeLicenseNumber,
  normalizeMexicanE164Phone,
  normalizePersonName,
  normalizeProfessionalName
} from "../../src/lib/identity-validation";

describe("identity validation", () => {
  it("normalizes names by trimming and collapsing spaces", () => {
    expect(normalizePersonName("  Ana   Maria  ", "firstName")).toBe("Ana Maria");
    expect(normalizePersonName("  Ramirez   Lopez  ", "lastName")).toBe("Ramirez Lopez");
  });

  it("rejects empty or too-short names", () => {
    expect(() => normalizePersonName("   ", "firstName")).toThrow(/nombre/i);
    expect(() => normalizePersonName("A", "firstName")).toThrow(/nombre/i);
  });

  it("validates professional names with meaningful letters", () => {
    expect(normalizeProfessionalName("  Dra.   Ana Ramirez  ")).toBe("Dra. Ana Ramirez");
    expect(() => normalizeProfessionalName("X")).toThrow(/profesional/i);
    expect(() => normalizeProfessionalName("aaaaa")).toThrow(/profesional/i);
  });

  it("normalizes Mexican phones to E.164 and rejects other formats", () => {
    expect(normalizeMexicanE164Phone("614 123 4567")).toBe("+526141234567");
    expect(normalizeMexicanE164Phone("+52 614 123 4567")).toBe("+526141234567");
    expect(normalizeMexicanE164Phone("")).toBeUndefined();
    expect(() => normalizeMexicanE164Phone("+1 202 555 0123")).toThrow(/telefono/i);
  });

  it("validates license number shape", () => {
    expect(normalizeLicenseNumber(" ced-1234567 ")).toBe("CED-1234567");
    expect(() => normalizeLicenseNumber("ABC")).toThrow(/cedula/i);
  });

  it("validates password confirmation when present", () => {
    expect(() => assertPasswordConfirmation("Str0ngPass!123", "Str0ngPass!123")).not.toThrow();
    expect(() => assertPasswordConfirmation("Str0ngPass!123", "different")).toThrow(/confirmacion/i);
  });
});
