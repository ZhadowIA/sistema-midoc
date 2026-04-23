import { getServerEnv } from '@/lib/env'

function getFormatter(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: getServerEnv().APP_TIMEZONE,
    ...options,
  })
}

function getParts(date: Date) {
  const parts = getFormatter({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const map = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: map.get('year') ?? '0000',
    month: map.get('month') ?? '00',
    day: map.get('day') ?? '00',
    hour: map.get('hour') ?? '00',
    minute: map.get('minute') ?? '00',
  }
}

export function getAppTimeZone() {
  return getServerEnv().APP_TIMEZONE
}

export function formatDateKeyInAppTimeZone(date: Date): string {
  const parts = getParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function formatTimeInAppTimeZone(date: Date): string {
  const parts = getParts(date)
  return `${parts.hour}:${parts.minute}`
}

