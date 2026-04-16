const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function toNumber(value: string): number {
  return Number.parseInt(value, 10)
}

export function parseDateOnlyLocal(dateStr: string): Date {
  const match = DATE_ONLY_PATTERN.exec(dateStr)
  if (!match) {
    throw new Error('Formato de fecha inválido. Usa YYYY-MM-DD.')
  }

  const year = toNumber(match[1])
  const month = toNumber(match[2])
  const day = toNumber(match[3])
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0)

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error('Fecha inválida.')
  }

  return parsed
}

export function getDayRangeLocal(dateStr: string): { start: Date; endExclusive: Date } {
  const start = parseDateOnlyLocal(dateStr)
  const endExclusive = new Date(start)
  endExclusive.setDate(endExclusive.getDate() + 1)
  return { start, endExclusive }
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function alignToSlotGrid(
  gridStart: Date,
  target: Date,
  slotMinutes: number
): Date {
  if (target <= gridStart) return new Date(gridStart)

  const slotMs = slotMinutes * 60_000
  const deltaMs = target.getTime() - gridStart.getTime()
  const steps = Math.ceil(deltaMs / slotMs)
  return new Date(gridStart.getTime() + steps * slotMs)
}
