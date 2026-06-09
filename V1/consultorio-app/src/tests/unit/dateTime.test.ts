import assert from 'node:assert/strict'
import {
  alignToSlotGrid,
  combineLocalDateAndTimeToIso,
  getDayRangeLocal,
  parseDateOnlyLocal,
  rangesOverlap,
  toLocalDateKey,
} from '../../lib/dateTime.ts'
import { runSuite } from '../testHarness.ts'

export async function runDateTimeUnitTests() {
  await runSuite('Unit: dateTime', [
    {
      name: 'parseDateOnlyLocal parses valid YYYY-MM-DD and preserves local date parts',
      run: () => {
        const parsed = parseDateOnlyLocal('2026-04-14')
        assert.equal(parsed.getFullYear(), 2026)
        assert.equal(parsed.getMonth(), 3)
        assert.equal(parsed.getDate(), 14)
        assert.equal(parsed.getHours(), 0)
      },
    },
    {
      name: 'parseDateOnlyLocal rejects impossible dates',
      run: () => {
        assert.throws(() => parseDateOnlyLocal('2026-02-31'), /Fecha inválida/)
      },
    },
    {
      name: 'getDayRangeLocal returns same-day start and exclusive next-day end',
      run: () => {
        const { start, endExclusive } = getDayRangeLocal('2026-01-10')
        assert.equal(toLocalDateKey(start), '2026-01-10')
        assert.equal(toLocalDateKey(endExclusive), '2026-01-11')
      },
    },
    {
      name: 'alignToSlotGrid rounds up target to next slot step',
      run: () => {
        const gridStart = new Date('2026-04-14T09:00:00.000Z')
        const target = new Date('2026-04-14T09:11:00.000Z')
        const aligned = alignToSlotGrid(gridStart, target, 15)
        assert.equal(aligned.toISOString(), '2026-04-14T09:15:00.000Z')
      },
    },
    {
      name: 'combineLocalDateAndTimeToIso builds valid ISO datetime',
      run: () => {
        const iso = combineLocalDateAndTimeToIso('2026-04-14', '09:30')
        assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      },
    },
    {
      name: 'rangesOverlap detects interval intersections',
      run: () => {
        const overlap = rangesOverlap({
          startA: new Date('2026-04-14T09:00:00.000Z'),
          endA: new Date('2026-04-14T09:30:00.000Z'),
          startB: new Date('2026-04-14T09:15:00.000Z'),
          endB: new Date('2026-04-14T09:45:00.000Z'),
        })
        const noOverlap = rangesOverlap({
          startA: new Date('2026-04-14T09:00:00.000Z'),
          endA: new Date('2026-04-14T09:30:00.000Z'),
          startB: new Date('2026-04-14T09:30:00.000Z'),
          endB: new Date('2026-04-14T10:00:00.000Z'),
        })
        assert.equal(overlap, true)
        assert.equal(noOverlap, false)
      },
    },
  ])
}
