import { isValidTimeZone } from './study-plan-time'

/**
 * The server runs in UTC but the plan is laid out in the student's own days. The browser tells the
 * server its IANA time zone in this cookie (see features/shell/time-zone-sync.tsx); server pages
 * read it with `getTimeZone()`.
 */
export const TIME_ZONE_COOKIE = 'margins_tz'

/** A usable zone from a cookie value, or UTC. */
export function resolveTimeZone(value: string | null | undefined): string {
  let zone = value ?? ''
  try {
    zone = decodeURIComponent(zone)
  } catch {
    zone = ''
  }
  return zone && zone.length <= 64 && isValidTimeZone(zone) ? zone : 'UTC'
}
