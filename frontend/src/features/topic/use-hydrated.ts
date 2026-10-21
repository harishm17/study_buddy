'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False on the server and during hydration, true afterwards. Use it for text that depends on
 * the browser's time zone (a date label), so the server and the browser never disagree.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
