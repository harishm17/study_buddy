'use client'

import * as React from 'react'

/**
 * Which units are open in the sidebar's topic list, remembered per course in localStorage. Only the
 * student's own choices are stored (unit id -> open); a unit with no stored choice follows the
 * default the sidebar works out (the one holding the current topic, or the first unfinished one).
 */

const EVENT = 'margins:sidebar-units-change'

export const unitStateKey = (courseId: string) => `margins:sidebar-units:${courseId}`

function read(courseId: string): string {
  try {
    return localStorage.getItem(unitStateKey(courseId)) ?? ''
  } catch {
    return ''
  }
}

function parse(raw: string): Record<string, boolean> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'))
  } catch {
    return {}
  }
}

const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/** The saved choices for a course, read straight from storage (for effects that run before the hook has them). */
export const readUnitChoices = (courseId: string): Record<string, boolean> => parse(read(courseId))

/** The student's open/closed choices for a course's units, and a setter that saves one. */
export function useUnitState(courseId: string | null): {
  choices: Record<string, boolean>
  setOpen: (unitId: string, open: boolean) => void
} {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => (courseId ? read(courseId) : ''),
    () => ''
  )
  const choices = React.useMemo(() => parse(raw), [raw])

  const setOpen = React.useCallback(
    (unitId: string, open: boolean) => {
      if (!courseId) return
      const next = { ...parse(read(courseId)), [unitId]: open }
      try {
        localStorage.setItem(unitStateKey(courseId), JSON.stringify(next))
      } catch {
        // Private mode: the choice lasts until the page closes.
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [courseId]
  )

  return { choices, setOpen }
}
