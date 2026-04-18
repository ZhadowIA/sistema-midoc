import { createHash } from 'crypto'

/**
 * Deterministic JSON stringify with sorted keys so that equivalent objects
 * always produce the same hash.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k]))
      .join(',') +
    '}'
  )
}

export function hashSnapshot(snapshot: unknown): string {
  return createHash('sha256').update(canonicalize(snapshot)).digest('hex')
}
