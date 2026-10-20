'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type Options = {
  examId: string
  /** The answers as they stand now. A change schedules a save. */
  answers: Record<string, unknown>
  /** What the server already has, so opening a resumed attempt does not save straight away. */
  savedAnswers: Record<string, unknown>
  /** Stop saving, e.g. while the exam is being submitted. */
  enabled?: boolean
  /** The server closed the attempt: time ran out (and it was submitted as saved) or it was submitted elsewhere. */
  onEnded: (submissionId: string | null) => void
  debounceMs?: number
}

const RETRY_MS = 10_000

/**
 * Saves exam answers to the server a few seconds after the last change, and at once when the
 * tab is hidden, loses focus or closes. A failed save is retried until it works or the
 * attempt ends. Answers are saved whole, so a later save always replaces an earlier one.
 */
export function useExamAutosave({
  examId,
  answers,
  savedAnswers,
  enabled = true,
  onEnded,
  debounceMs = 3000,
}: Options) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const latestRef = useRef(answers)
  const savedJsonRef = useRef(JSON.stringify(savedAnswers))
  const inFlightRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endedRef = useRef(false)
  const enabledRef = useRef(enabled)
  const onEndedRef = useRef(onEnded)
  // The retry timers call the latest save without the callback referring to itself.
  const saveRef = useRef<(keepalive?: boolean) => Promise<void>>(async () => {})

  useEffect(() => {
    latestRef.current = answers
    enabledRef.current = enabled
    onEndedRef.current = onEnded
  })

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const save = useCallback(
    async (keepalive = false) => {
      if (!enabledRef.current || endedRef.current || inFlightRef.current) return
      const sentJson = JSON.stringify(latestRef.current)
      if (sentJson === savedJsonRef.current) return

      clearTimer()
      inFlightRef.current = true
      setStatus('saving')
      const body = JSON.stringify({ answers: latestRef.current })
      try {
        const response = await fetch(`/api/exams/${examId}/attempt`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive,
        })
        if (response.status === 409) {
          const payload = await response.json().catch(() => ({}))
          endedRef.current = true
          onEndedRef.current(payload?.error?.details?.submissionId ?? null)
          return
        }
        if (!response.ok) throw new Error(`Save failed (${response.status})`)
        savedJsonRef.current = sentJson
        setLastSavedAt(new Date())
        setStatus('saved')
      } catch {
        setStatus('error')
        timerRef.current = setTimeout(() => void saveRef.current(), RETRY_MS)
        return
      } finally {
        inFlightRef.current = false
      }
      // Answers changed while the request was out.
      if (JSON.stringify(latestRef.current) !== savedJsonRef.current) {
        timerRef.current = setTimeout(() => void saveRef.current(), debounceMs)
      }
    },
    [examId, debounceMs]
  )

  useEffect(() => {
    saveRef.current = save
  }, [save])

  // Save a few seconds after the last change.
  useEffect(() => {
    if (!enabled) return
    if (JSON.stringify(answers) === savedJsonRef.current) return
    clearTimer()
    timerRef.current = setTimeout(() => void save(), debounceMs)
    return clearTimer
  }, [answers, enabled, debounceMs, save])

  // Save at once when the student leaves the tab or the page.
  useEffect(() => {
    const flush = () => void save(true)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', flush)
      window.removeEventListener('pagehide', flush)
      clearTimer()
    }
  }, [save])

  return { status, lastSavedAt, saveNow: () => save() }
}
