'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * router.refresh() now, and again a few seconds later. When a file finishes processing the AI
 * service starts topic finding a moment after, so the first refresh can miss it.
 */
export function useRefreshSoon() {
  const router = useRouter()
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  return useCallback(() => {
    router.refresh()
    timers.current.push(setTimeout(() => router.refresh(), 3000), setTimeout(() => router.refresh(), 8000))
  }, [router])
}
