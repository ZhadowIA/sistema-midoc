/**
 * Retencion del buzon temporal (13_contrato_sincronizacion.md §2): "el tiempo
 * de vida maximo de un elemento no reclamado es de 30 dias; despues se purga".
 * Aplica a todo contenido CLINICO en transito que la app no haya confirmado
 * con ACK: documentos del buzon y preconsultas selladas.
 */
export const MAILBOX_RETENTION_DAYS = 30;

const DAY_MS = 24 * 3_600_000;

/** Fecha de expiracion de un elemento que entra al buzon ahora. */
export function mailboxExpiresAt(now: Date = new Date(), retentionDays = MAILBOX_RETENTION_DAYS) {
  return new Date(now.getTime() + retentionDays * DAY_MS);
}

/** Fecha de corte: lo creado antes de ella ya excedio la retencion. */
export function mailboxRetentionCutoff(now: Date, retentionDays = MAILBOX_RETENTION_DAYS) {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}
