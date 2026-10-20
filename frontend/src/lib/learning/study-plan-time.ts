// The study plan starts at 9:00 on the student's own clock. The server runs in UTC (Cloud
// Run), so the browser sends its IANA time zone and the start time is worked out in that zone.

export const PLAN_START_HOUR = 9

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

type LocalParts = { year: number; month: number; day: number }

/** The calendar date it is at `instant` in `timeZone`. */
export function localDateParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return wallAsUtc - Math.floor(instant / 1000) * 1000
}

/** The UTC instant at which the wall clock in `timeZone` reads the given date and time. */
export function zonedTimeToUtc(
  { year, month, day }: LocalParts,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  const firstOffset = zoneOffsetMs(wallAsUtc, timeZone)
  let instant = wallAsUtc - firstOffset
  // Near a daylight-saving change the offset at the result can differ from the first guess.
  const secondOffset = zoneOffsetMs(instant, timeZone)
  if (secondOffset !== firstOffset) instant = wallAsUtc - secondOffset
  return new Date(instant)
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * When the plan for a day starts. `date` is a YYYY-MM-DD calendar date in the student's zone;
 * without it, today in that zone. Returns null for a date that does not exist.
 */
export function planStartTime(options: {
  date?: string
  timeZone: string
  now?: Date
}): Date | null {
  const { date, timeZone, now = new Date() } = options
  let parts: LocalParts
  if (date) {
    const match = DATE_ONLY.exec(date)
    if (!match) return null
    parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    if (
      check.getUTCFullYear() !== parts.year ||
      check.getUTCMonth() !== parts.month - 1 ||
      check.getUTCDate() !== parts.day
    ) {
      return null
    }
  } else {
    parts = localDateParts(now, timeZone)
  }
  return zonedTimeToUtc(parts, PLAN_START_HOUR, 0, timeZone)
}
