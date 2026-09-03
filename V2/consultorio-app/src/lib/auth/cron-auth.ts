import { timingSafeEqual } from "node:crypto";

import { env } from "../env";

/**
 * Autorizacion de las rutas internas que dispara el cron
 * (`.github/workflows/cron-jobs.yml`): `Authorization: Bearer <secreto>`.
 * Unico punto de verdad para todas las rutas bajo `/api/internal/*`, con
 * comparacion en tiempo constante.
 */
export function isCronAuthorized(request: Request): boolean {
  const provided = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${env.NOTIFICATION_CRON_SECRET}`, "utf8");

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
