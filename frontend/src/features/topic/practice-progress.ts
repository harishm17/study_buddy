'use client'

import * as React from 'react'
import { EMPTY, parseProgress, type PracticeProgress } from './practice-keys'

/**
 * Practice progress lives in the browser: the backend only keeps flags for notes, examples and
 * the quiz. Solved and revealed steps are stored per topic in localStorage. A step is named by
 * its problem's position and title and its own position, so adding problems to the end keeps
 * earlier progress, while a rewrite with new titles starts clean.
 */

const EVENT = 'margins:practice-progress'
const storageKey = (topicId: string) => `margins:practice:${topicId}`

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

function read(topicId: string): string {
  try {
    return window.localStorage.getItem(storageKey(topicId)) ?? ''
  } catch {
    return ''
  }
}

/** The raw stored string is the snapshot (a primitive, so React can compare it). */
export function usePracticeProgress(topicId: string) {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => read(topicId),
    () => ''
  )
  const progress = React.useMemo(() => parseProgress(raw), [raw])

  const update = React.useCallback(
    (change: (current: PracticeProgress) => PracticeProgress) => {
      const next = change(parseProgress(read(topicId)))
      try {
        window.localStorage.setItem(storageKey(topicId), JSON.stringify(next))
      } catch {
        // Storage can be full or blocked; progress then lasts until the page is closed.
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [topicId]
  )

  const markSolved = React.useCallback(
    (key: string) =>
      update((current) => ({
        solved: current.solved.includes(key) ? current.solved : [...current.solved, key],
        revealed: current.revealed.filter((item) => item !== key),
      })),
    [update]
  )
  const markRevealed = React.useCallback(
    (key: string) =>
      update((current) => ({
        solved: current.solved,
        revealed: current.revealed.includes(key) || current.solved.includes(key) ? current.revealed : [...current.revealed, key],
      })),
    [update]
  )
  /** Forget the given steps, to work a problem again. */
  const clear = React.useCallback(
    (keys: string[]) =>
      update((current) => ({
        solved: current.solved.filter((item) => !keys.includes(item)),
        revealed: current.revealed.filter((item) => !keys.includes(item)),
      })),
    [update]
  )

  return { progress, markSolved, markRevealed, clear }
}
