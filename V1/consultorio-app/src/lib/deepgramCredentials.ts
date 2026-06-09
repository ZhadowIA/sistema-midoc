export function isDeepgramCredentialExpired(
  expiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= nowMs;
}

