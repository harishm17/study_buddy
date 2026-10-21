'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const MIN_GAP_MS = 20_000

/** Re-reads the page's data when the student comes back to the tab (at most every 20 seconds). */
export function RefreshOnFocus() {
  const router = useRouter()
  const last = useRef(0)

  useEffect(() => {
    last.current = Date.now()
    const refresh = () => {
      if (document.hidden || Date.now() - last.current < MIN_GAP_MS) return
      last.current = Date.now()
      router.refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [router])

  return null
}
