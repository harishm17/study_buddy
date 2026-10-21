'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** True on Apple platforms, so shortcut hints can say Cmd instead of Ctrl. False on the server. */
export function useIsMac(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent),
    () => false
  )
}

/** The modifier key label for this platform. */
export function useModKey(): string {
  return useIsMac() ? 'Cmd' : 'Ctrl'
}
