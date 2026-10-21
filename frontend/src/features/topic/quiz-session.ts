'use client'

import * as React from 'react'

/**
 * A quiz in progress, kept in sessionStorage per topic and quiz set, so a refresh does not lose
 * the answers. A stored session means "taking": the page reads it back and resumes.
 */

export type QuizSession = { answers: Record<string, string>; index: number }

const EVENT = 'margins:quiz-session'
const storageKey = (topicId: string, setId: string) => `margins:quiz:${topicId}:${setId}`

function read(topicId: string, setId: string): string {
  try {
    return window.sessionStorage.getItem(storageKey(topicId, setId)) ?? ''
  } catch {
    return ''
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

export function parseSession(raw: string): QuizSession | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<QuizSession>
    const answers: Record<string, string> = {}
    for (const [key, answer] of Object.entries(value.answers ?? {})) {
      if (typeof answer === 'string') answers[key] = answer
    }
    return { answers, index: typeof value.index === 'number' && value.index >= 0 ? Math.floor(value.index) : 0 }
  } catch {
    return null
  }
}

export function useQuizSession(topicId: string, setId: string) {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => read(topicId, setId),
    () => ''
  )
  const session = React.useMemo(() => parseSession(raw), [raw])

  const save = React.useCallback(
    (next: QuizSession) => {
      try {
        window.sessionStorage.setItem(storageKey(topicId, setId), JSON.stringify(next))
      } catch {
        // Storage can be blocked; the quiz still works until the page is closed.
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [topicId, setId]
  )

  const clear = React.useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKey(topicId, setId))
    } catch {
      // Nothing to clear.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [topicId, setId])

  return { session, save, clear }
}
