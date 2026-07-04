import { prisma } from "./prisma";

export class RateLimitError extends Error {
  constructor() {
    super("Too many attempts.");
  }
}

// Probabilidad de disparar la limpieza de contadores expirados en cada llamada.
// Mantiene la tabla acotada sin necesitar un cron aparte.
const CLEANUP_PROBABILITY = 0.01;

/**
 * Contador de intentos respaldado en Postgres: el limite sobrevive reinicios
 * y es compartido entre instancias (un Map en memoria por proceso multiplica
 * el limite real por N instancias en despliegues serverless/replicados).
 * El upsert es atomico, asi que llamadas concurrentes no pierden incrementos.
 */
export async function assertRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + options.windowMs);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitCounter" ("key", "count", "expiresAt")
    VALUES (${options.key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitCounter"."expiresAt" <= now() THEN 1
        ELSE "RateLimitCounter"."count" + 1
      END,
      "expiresAt" = CASE
        WHEN "RateLimitCounter"."expiresAt" <= now() THEN ${expiresAt}
        ELSE "RateLimitCounter"."expiresAt"
      END
    RETURNING "count"
  `;

  if (Math.random() < CLEANUP_PROBABILITY) {
    void prisma
      .$executeRaw`DELETE FROM "RateLimitCounter" WHERE "expiresAt" <= now()`
      .catch(() => undefined);
  }

  const count = rows[0]?.count ?? 1;
  if (count > options.limit) {
    throw new RateLimitError();
  }
}
