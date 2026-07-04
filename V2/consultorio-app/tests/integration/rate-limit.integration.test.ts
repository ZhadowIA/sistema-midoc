import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

import { assertRateLimit, RateLimitError } from "../../src/lib/rate-limit";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "key" LIKE 'test:%'`;
  await prisma.$disconnect();
});

describe("assertRateLimit (Postgres-backed)", () => {
  it("allows calls under the limit and rejects beyond it with RateLimitError", async () => {
    const key = `test:${randomUUID()}`;

    for (let i = 0; i < 3; i += 1) {
      await expect(assertRateLimit({ key, limit: 3, windowMs: 60_000 })).resolves.toBeUndefined();
    }

    await expect(assertRateLimit({ key, limit: 3, windowMs: 60_000 })).rejects.toThrow(RateLimitError);
  });

  it("resets the counter after the window expires", async () => {
    const key = `test:${randomUUID()}`;

    await assertRateLimit({ key, limit: 1, windowMs: 60_000 });
    // Simula el paso del tiempo expirando la ventana directamente en la base.
    await prisma.$executeRaw`
      UPDATE "RateLimitCounter" SET "expiresAt" = now() - interval '1 second' WHERE "key" = ${key}
    `;

    await expect(assertRateLimit({ key, limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
  });

  it("tracks independent keys separately", async () => {
    const keyA = `test:${randomUUID()}`;
    const keyB = `test:${randomUUID()}`;

    await assertRateLimit({ key: keyA, limit: 1, windowMs: 60_000 });
    await expect(assertRateLimit({ key: keyB, limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
    await expect(assertRateLimit({ key: keyA, limit: 1, windowMs: 60_000 })).rejects.toThrow(RateLimitError);
  });

  it("persists the counter across module instances (no in-memory state)", async () => {
    const key = `test:${randomUUID()}`;
    await assertRateLimit({ key, limit: 1, windowMs: 60_000 });

    const row = await prisma.$queryRaw<{ count: number }[]>`
      SELECT "count" FROM "RateLimitCounter" WHERE "key" = ${key}
    `;
    expect(row[0]?.count).toBe(1);
  });
});
