import { cookies } from 'next/headers'
import { resolveTimeZone, TIME_ZONE_COOKIE } from '@/lib/learning/time-zone'

/** The student's time zone from the cookie the browser sets, or UTC before it has. */
export async function getTimeZone(): Promise<string> {
  return resolveTimeZone((await cookies()).get(TIME_ZONE_COOKIE)?.value)
}
