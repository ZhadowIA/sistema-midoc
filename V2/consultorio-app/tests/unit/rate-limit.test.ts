import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { assertRateLimit, RateLimitError } from "../../src/lib/rate-limit";

describe("assertRateLimit", () => {
  it("allows calls under the limit and rejects beyond it with RateLimitError", () => {
    const key = `test:${randomUUID()}`;

    for (let i = 0; i < 3; i += 1) {
      expect(() => assertRateLimit({ key, limit: 3, windowMs: 60_000 })).not.toThrow();
    }

    expect(() => assertRateLimit({ key, limit: 3, windowMs: 60_000 })).toThrow(RateLimitError);
  });

  it("resets the counter after the window expires", () => {
    const key = `test:${randomUUID()}`;

    assertRateLimit({ key, limit: 1, windowMs: 1 });
    const waitUntil = Date.now() + 5;
    while (Date.now() < waitUntil) {
      // busy-wait past the 1ms window
    }
    expect(() => assertRateLimit({ key, limit: 1, windowMs: 60_000 })).not.toThrow();
  });

  it("tracks independent keys separately", () => {
    const keyA = `test:${randomUUID()}`;
    const keyB = `test:${randomUUID()}`;

    assertRateLimit({ key: keyA, limit: 1, windowMs: 60_000 });
    expect(() => assertRateLimit({ key: keyB, limit: 1, windowMs: 60_000 })).not.toThrow();
    expect(() => assertRateLimit({ key: keyA, limit: 1, windowMs: 60_000 })).toThrow(RateLimitError);
  });
});
