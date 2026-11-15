import { describe, expect, it } from "vitest";

import { reminderWindow } from "../../src/services/license/updates-reminder-service";

const now = new Date("2026-10-18T15:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe("ventana del aviso de fin de actualizaciones", () => {
  it("no avisa con mas de 30 dias por delante", () => {
    expect(reminderWindow(inDays(31), now)).toBeNull();
    expect(reminderWindow(inDays(365), now)).toBeNull();
  });

  it("avisa a 30 dias y despues a 7", () => {
    expect(reminderWindow(inDays(30), now)).toBe(30);
    expect(reminderWindow(inDays(8), now)).toBe(30);
    expect(reminderWindow(inDays(7), now)).toBe(7);
    expect(reminderWindow(inDays(0.5), now)).toBe(7);
  });

  it("no avisa si ya terminaron", () => {
    expect(reminderWindow(inDays(-1), now)).toBeNull();
  });
});
