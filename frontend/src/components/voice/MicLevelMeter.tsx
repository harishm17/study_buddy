'use client'

import { useEffect, useState, type RefObject } from 'react'
import { Progress } from '@/components/ui/progress'

const REFRESH_MS = 100

/**
 * Shows the mic level held in a ref. It re-renders about 10 times a second, and only this
 * small component does, not the voice coach around it.
 */
export function MicLevelMeter({
  levelRef,
  active,
}: {
  levelRef: RefObject<number>
  active: boolean
}) {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setLevel(levelRef.current ?? 0), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [active, levelRef])

  return (
    <Progress
      value={active ? Math.min(level * 150, 100) : 0}
      className="mt-3"
      aria-label="Microphone level"
    />
  )
}
