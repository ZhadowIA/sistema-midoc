import { describe, expect, it } from "vitest";

import { prescriberProfileInputSchema } from "../../src/services/doctor/prescriber-profile-service";

function input(overrides: Record<string, unknown> = {}) {
  return {
    professionalName: "Dra. Elsa Rios",
    licenseNumber: "1234567",
    degreeInstitution: "Universidad Autonoma de Chihuahua",
    specialtyTitle: null,
    specialtyLicenseNumber: null,
    addressLine1: "Av. Juarez 100",
    addressLine2: null,
    city: "Chihuahua",
    state: "Chihuahua",
    postalCode: "31000",
    expectedUpdatedAt: "2026-10-10T12:00:00.000Z",
    ...overrides
  };
}

describe("prescriber profile input", () => {
  it("accepts a general practitioner without specialty", () => {
    expect(prescriberProfileInputSchema.safeParse(input()).success).toBe(true);
  });

  it("requires the specialty license when a specialty is declared", () => {
    const result = prescriberProfileInputSchema.safeParse(input({ specialtyTitle: "Pediatria" }));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("specialtyLicenseNumber");
  });

  it("turns blank optional fields into null", () => {
    const result = prescriberProfileInputSchema.parse(input({ addressLine2: "   ", specialtyTitle: "" }));
    expect(result.addressLine2).toBeNull();
    expect(result.specialtyTitle).toBeNull();
  });

  it("requires the version the client read", () => {
    expect(prescriberProfileInputSchema.safeParse(input({ expectedUpdatedAt: undefined })).success).toBe(false);
  });
});
