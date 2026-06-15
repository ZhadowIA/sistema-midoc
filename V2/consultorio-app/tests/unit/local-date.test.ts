import { describe, expect, it } from "vitest";

import { parseLocalDate, toLocalDateString } from "../../src/lib/local-date";

describe("local-date helpers (paso 19, fix TZ)", () => {
  it("formats a date from its local components (no UTC shift)", () => {
    // Medianoche local del 15: toISOString podria dar el 14 en husos negativos.
    const local = new Date(2026, 5, 15, 0, 0, 0);
    expect(toLocalDateString(local)).toBe("2026-06-15");
    // Tarde-noche local: sigue siendo el mismo dia local.
    const evening = new Date(2026, 5, 15, 23, 30, 0);
    expect(toLocalDateString(evening)).toBe("2026-06-15");
  });

  it("parses a YYYY-MM-DD into local midnight (round-trips)", () => {
    const parsed = parseLocalDate("2026-06-15");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(15);
    expect(toLocalDateString(parsed)).toBe("2026-06-15");
  });
});
