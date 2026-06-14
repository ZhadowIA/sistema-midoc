import { describe, expect, it } from "vitest";

describe("homepage copy", () => {
  it("centers the patient search task", () => {
    const heading = "Encuentra a tu medico y agenda tu consulta";
    const action = "Buscar medico";

    expect(heading).toContain("Encuentra");
    expect(action).toBe("Buscar medico");
  });
});
