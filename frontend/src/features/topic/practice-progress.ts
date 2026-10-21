'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  groupProgress,
  mergeServerProgress,
  parseProgress,
  type PracticeProgress,
  type ProblemProgress,
} from './practice-keys'

/**
 * Practice progress is kept on the server (POST /api/topics/[id]/practice-progress, one row per
 * problem) so it follows the student across devices, and cached in localStorage so the views read
 * it synchronously and it works offline. Each change is written to the cache at once and sent to
 * the server a moment later. When a topic page opens, <PracticeProgressSync> loads the server's
 * rows into the cache, and uploads whatever the browser has that the server does not (the first
 * time, that is everything the browser stored before the server did).
 *
 * A step is named by its problem's position and title and its own position, so adding problems to
 * the end keeps earlier progress, while a rewrite with new titles starts clean.
 */

const EVENT = 'margins:practice-progress'
const SAVED_EVENT = 'margins:practice-saved'
const storageKey = (topicId: string) => `margins:practice:${topicId}`
const syncedKey = (topicId: string) => `margins:practice-synced:${topicId}`

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

function write(topicId: string, progress: PracticeProgress) {
  try {
    window.localStorage.setItem(storageKey(topicId), JSON.stringify(progress))
  } catch {
    // Storage can be full or blocked; progress then lasts until the page is closed.
  }
  window.dispatchEvent(new Event(EVENT))
}

// ---------------------------------------------------------------------------------------
// Sending to the server

type Payload = ProblemProgress & { migrated?: boolean }

async function send(topicId: string, payload: Payload): Promise<{ completedNow: boolean } | null> {
  try {
    const response = await fetch(`/api/topics/${topicId}/practice-progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
    if (!response.ok) return null
    const body = (await response.json()) as { completedNow?: boolean }
    if (body.completedNow) window.dispatchEvent(new Event(SAVED_EVENT))
    return { completedNow: !!body.completedNow }
  } catch {
    // Offline or the server is down: the browser keeps the progress and uploads it on the next visit.
    return null
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Sends the problems whose progress changed, a moment after the last change. The latest state is read when it fires. */
function scheduleSync(topicId: string, problemKeys: { problemIndex: number; problemTitle: string }[]) {
  for (const { problemIndex, problemTitle } of problemKeys) {
    const id = `${topicId}:${problemIndex}:${problemTitle}`
    clearTimeout(timers.get(id))
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        const group = groupProgress(parseProgress(read(topicId))).find(
          (item) => item.problemIndex === problemIndex && item.problemTitle === problemTitle
        )
        // Nothing left locally means the problem was started over.
        void send(topicId, group ?? { problemIndex, problemTitle, solvedSteps: [], revealedSteps: [], hintedSteps: [] })
      }, 250)
    )
  }
}

const sameProblem = (a: ProblemProgress, b: { problemIndex: number; problemTitle: string }) =>
  a.problemIndex === b.problemIndex && a.problemTitle === b.problemTitle

/** The problems whose steps differ between two states, including problems that became empty. */
function changedProblems(before: PracticeProgress, after: PracticeProgress) {
  const a = groupProgress(before)
  const b = groupProgress(after)
  const same = (x: ProblemProgress, y: ProblemProgress) => JSON.stringify(x) === JSON.stringify(y)
  const changed: { problemIndex: number; problemTitle: string }[] = []
  for (const group of b) if (!a.some((other) => same(other, group))) changed.push(group)
  for (const group of a) if (!b.some((other) => sameProblem(other, group))) changed.push(group)
  return changed
}

// ---------------------------------------------------------------------------------------
// The hook the views use

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
      const before = parseProgress(read(topicId))
      const next = change(before)
      write(topicId, next)
      scheduleSync(topicId, changedProblems(before, next))
    },
    [topicId]
  )

  const markSolved = React.useCallback(
    (key: string) =>
      update((current) => ({
        solved: current.solved.includes(key) ? current.solved : [...current.solved, key],
        revealed: current.revealed.filter((item) => item !== key),
        hinted: current.hinted,
      })),
    [update]
  )
  const markRevealed = React.useCallback(
    (key: string) =>
      update((current) => ({
        solved: current.solved,
        revealed: current.revealed.includes(key) || current.solved.includes(key) ? current.revealed : [...current.revealed, key],
        hinted: current.hinted,
      })),
    [update]
  )
  /** The hint of a step was opened: the step no longer counts towards the score when the problem is finished. */
  const markHinted = React.useCallback(
    (key: string) =>
      update((current) => ({
        ...current,
        hinted: current.hinted.includes(key) ? current.hinted : [...current.hinted, key],
      })),
    [update]
  )
  /** Forget the given steps, to work a problem again. */
  const clear = React.useCallback(
    (keys: string[]) =>
      update((current) => ({
        solved: current.solved.filter((item) => !keys.includes(item)),
        revealed: current.revealed.filter((item) => !keys.includes(item)),
        hinted: current.hinted.filter((item) => !keys.includes(item)),
      })),
    [update]
  )

  return { progress, markSolved, markRevealed, markHinted, clear }
}

// ---------------------------------------------------------------------------------------
// Loading from the server, once per topic page

/**
 * Loads the server's practice progress into the browser's cache when a topic page opens (so a
 * reload or another device shows it), uploads what only the browser has (the first time: the
 * progress kept before the server stored any, without scoring it), and refreshes the page when a
 * finished problem moved the topic's mastery. Renders nothing.
 */
export function PracticeProgressSync({ topicId, server }: { topicId: string; server: ProblemProgress[] }) {
  const router = useRouter()
  const done = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (done.current === topicId) return
    done.current = topicId
    const local = parseProgress(read(topicId))
    const { merged, toUpload } = mergeServerProgress(local, server)
    if (JSON.stringify(merged) !== JSON.stringify(local)) write(topicId, merged)

    let alreadySynced = false
    try {
      alreadySynced = window.localStorage.getItem(syncedKey(topicId)) === '1'
    } catch {
      // Without storage the upload simply repeats; the server joins it with what it has.
    }
    for (const problem of toUpload) void send(topicId, { ...problem, migrated: !alreadySynced })
    try {
      window.localStorage.setItem(syncedKey(topicId), '1')
    } catch {
      // See above.
    }
  }, [topicId, server])

  React.useEffect(() => {
    const onSaved = () => React.startTransition(() => router.refresh())
    window.addEventListener(SAVED_EVENT, onSaved)
    return () => window.removeEventListener(SAVED_EVENT, onSaved)
  }, [router])

  return null
}
