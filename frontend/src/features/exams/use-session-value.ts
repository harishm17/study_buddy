'use client'

import * as React from 'react'

const memory = new Map<string, string>()
const listeners = new Set<() => void>()

const subscribe = (callback: () => void) => {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

function read(key: string): string | null {
  const held = memory.get(key)
  if (held !== undefined) return held
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * A string kept in sessionStorage (and in memory, in case storage is blocked), readable without
 * a hydration mismatch: the server and the first client render see null. It survives a refresh
 * of the tab and is gone when the tab closes.
 */
export function useSessionValue(key: string): [string | null, (value: string) => void] {
  const value = React.useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null
  )
  const set = React.useCallback(
    (next: string) => {
      memory.set(key, next)
      try {
        window.sessionStorage.setItem(key, next)
      } catch {
        // Storage can be blocked; the in-memory copy still works for this page view.
      }
      listeners.forEach((listener) => listener())
    },
    [key]
  )
  return [value, set]
}
