export const AVAILABILITY_SLOTS = [
  'Morning',
  'Afternoon',
  'Evening',
  'Night',
] as const

export type AvailabilitySlotName = (typeof AVAILABILITY_SLOTS)[number]

export function userTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'Asia/Kolkata'
  }
}

export function availabilityQuery(): string {
  return `tz=${encodeURIComponent(userTimezone())}`
}

export function makeSlotKey(dayIso: string, slot: string): string {
  return `${dayIso}|${slot}`
}

export function parseSlotKey(key: string): { day: string; slot: string } {
  const i = key.indexOf('|')
  if (i <= 0) {
    throw new Error(`Invalid slot key: ${key}`)
  }
  return { day: key.slice(0, i), slot: key.slice(i + 1) }
}
