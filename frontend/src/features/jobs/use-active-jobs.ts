'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchActiveJobs, type NormalizedJob } from '@/lib/jobs/poll-job'

type UseActiveJobsOptions = {
  courseId?: string
  /** Job types to include, e.g. ['extract_topics']. */
  types?: string[]
  /** Keep only jobs whose targetKey starts with this, e.g. `content:${topicId}:`. */
  targetPrefix?: string
  /** Turn it off (for example until a dialog opens). Default true. */
  enabled?: boolean
  /** How often to look again while something is running. Default 3000ms. */
  intervalMs?: number
  /** Called when jobs that were running are gone (finished or failed). Refresh the page here. */
  onSettled?: () => void
}

export type ActiveJob = NormalizedJob & { targetKey: string | null }

const targetKeyOf = (job: NormalizedJob): string | null =>
  typeof job.raw.targetKey === 'string' ? job.raw.targetKey : null

/**
 * The user's pending and processing jobs (GET /api/jobs?active=1), so a screen can pick up
 * work that was started before a refresh or by the server itself. While anything is running it
 * looks again every few seconds, pausing in a hidden tab, and calls `onSettled` once the list
 * empties.
 */
export function useActiveJobs({
  courseId,
  types,
  targetPrefix,
  enabled = true,
  intervalMs = 3000,
  onSettled,
}: UseActiveJobsOptions = {}) {
  const [jobs, setJobs] = useState<ActiveJob[]>([])
  const [ready, setReady] = useState(false)
  const settledRef = useRef(onSettled)
  const hadJobsRef = useRef(false)
  const typesKey = types?.join(',') ?? ''

  useEffect(() => {
    settledRef.current = onSettled
  })

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const found = await fetchActiveJobs(
        { projectId: courseId, jobTypes: typesKey ? typesKey.split(',') : undefined },
        signal
      )
      if (signal?.aborted) return []
      const next = found
        .map((job) => ({ ...job, targetKey: targetKeyOf(job) }))
        .filter((job) => !targetPrefix || job.targetKey?.startsWith(targetPrefix))
      setJobs(next)
      setReady(true)
      if (next.length > 0) hadJobsRef.current = true
      else if (hadJobsRef.current) {
        hadJobsRef.current = false
        settledRef.current?.()
      }
      return next
    },
    [courseId, typesKey, targetPrefix]
  )

  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(run, intervalMs)
        return
      }
      const next = await load(controller.signal).catch(() => [])
      if (controller.signal.aborted) return
      if (next.length > 0) timer = setTimeout(run, intervalMs)
    }
    run()
    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [enabled, load, intervalMs, tick])

  return { jobs, ready, refresh }
}
