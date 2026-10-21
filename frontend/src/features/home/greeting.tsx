'use client'

import { useSyncExternalStore } from 'react'
import { firstName, greetingForHour } from '@/lib/format'

const subscribe = () => () => {}

/**
 * "Good evening, Harish" by the visitor's local time. The server does not know the time zone,
 * so the words stay hidden (the line keeps its height) until the browser has worked them out.
 */
export function Greeting({ name }: { name: string | null }) {
  const hour = useSyncExternalStore(
    subscribe,
    () => new Date().getHours(),
    () => null
  )
  const first = firstName(name)
  const text = first ? `${hour === null ? 'Welcome back' : greetingForHour(hour)}, ${first}` : 'Welcome back'
  return (
    <span className={hour === null && first ? 'invisible' : undefined} suppressHydrationWarning>
      {text}
    </span>
  )
}
