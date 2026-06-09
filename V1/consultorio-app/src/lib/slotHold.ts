import { subMinutes } from 'date-fns'

export const SLOT_HOLD_REASON_PREFIX = 'TEMP_HOLD:'
export const SLOT_HOLD_TTL_MINUTES = 5

export function buildSlotHoldReason(token: string) {
  return `${SLOT_HOLD_REASON_PREFIX}${token}`
}

export function extractSlotHoldToken(reason: string | null | undefined): string | null {
  if (!reason) return null
  if (!reason.startsWith(SLOT_HOLD_REASON_PREFIX)) return null
  const token = reason.slice(SLOT_HOLD_REASON_PREFIX.length)
  return token || null
}

export function getSlotHoldActiveCutoff(reference = new Date()) {
  return subMinutes(reference, SLOT_HOLD_TTL_MINUTES)
}

export function isTemporarySlotHoldBlock(block: { reason?: string | null; type?: string | null }) {
  return block.type === 'PRIVATE_RESERVED' && Boolean(extractSlotHoldToken(block.reason ?? null))
}

export function isActiveTemporarySlotHold(
  block: { reason?: string | null; type?: string | null; createdAt?: Date | string | null },
  reference = new Date()
) {
  if (!isTemporarySlotHoldBlock(block)) return false
  const createdAt = block.createdAt instanceof Date ? block.createdAt : new Date(block.createdAt ?? 0)
  if (Number.isNaN(createdAt.getTime())) return false
  return createdAt >= getSlotHoldActiveCutoff(reference)
}

export function getSlotHoldExpiration(createdAt: Date) {
  return new Date(createdAt.getTime() + SLOT_HOLD_TTL_MINUTES * 60_000)
}
