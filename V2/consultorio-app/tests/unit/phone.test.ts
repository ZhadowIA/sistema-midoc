import { describe, expect, it } from "vitest";

import {
  DEFAULT_COUNTRY,
  detectCountry,
  dialForCountry,
  formatFullPhone,
  isValidNationalNumber,
  onlyDigits
} from "../../src/lib/phone";

describe("phone helpers (paso 19, rebanada 4)", () => {
  it("validates exactly 10 national digits", () => {
    expect(isValidNationalNumber("5512345678")).toBe(true);
    expect(isValidNationalNumber("55 1234 5678")).toBe(true);
    expect(isValidNationalNumber("123456789")).toBe(false);
    expect(isValidNationalNumber("12345678901")).toBe(false);
    expect(isValidNationalNumber("")).toBe(false);
  });

  it("strips non-digits", () => {
    expect(onlyDigits("+52 (55) 1234-5678")).toBe("525512345678");
  });

  it("detects the country from the locale region, defaulting to Mexico", () => {
    expect(detectCountry("es-MX")).toBe("MX");
    expect(detectCountry("en-US")).toBe("US");
    expect(detectCountry("es")).toBe(DEFAULT_COUNTRY);
    expect(detectCountry("xx-ZZ")).toBe(DEFAULT_COUNTRY);
  });

  it("formats a full phone with the country dial code", () => {
    expect(dialForCountry("MX")).toBe("+52");
    expect(formatFullPhone("MX", "55 1234 5678")).toBe("+52 5512345678");
    expect(formatFullPhone("US", "2025550123")).toBe("+1 2025550123");
  });
});
