'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { browserTimeZone } from '@/lib/utils/timezone'
import { TIME_ZONE_COOKIE } from '@/lib/learning/time-zone'

/**
 * Tells the server the student's time zone, so "today" in the plan is their today. Sets a cookie
 * when it is missing or has changed (travel) and refreshes the page once so it is used. Renders nothing.
 */
export function TimeZoneSync() {
  const router = useRouter()
  React.useEffect(() => {
    const zone = browserTimeZone()
    const current = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.split('=')[1]
    if (current && decodeURIComponent(current) === zone) return
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }, [router])
  return null
}
