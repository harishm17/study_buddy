'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_POLL_TIMEOUT_MS,
  fetchActiveJobs,
  pollJobUntilDone,
  type ActiveJobFilter,
  type NormalizedJob,
  type PollResult,
} from '@/lib/jobs/poll-job'

export type { NormalizedJob, NormalizedJobState, PollResult } from '@/lib/jobs/poll-job'
export { pollFailureMessage } from '@/lib/jobs/poll-job'

type UseJobPollingOptions = {
  /** Visible time to wait before giving up with state 'timeout'. */
  timeoutMs?: number
}

/**
 * The one way to follow a processing job from the browser.
 *
 * Each job is polled on its own, so any number can run at once (one per uploaded file, say)
 * and starting one never cancels another. Polling backs off from 1 s to 10 s, pauses while
 * the tab is hidden, and ends with state 'timeout' (job still running) after `timeoutMs`.
 * Everything stops when the component unmounts.
 *
 * `resumeActiveJobs` lists the user's pending/processing jobs so a page that was refreshed
 * mid-job can pick them up again with `pollJob`.
 */
export function useJobPolling(options: UseJobPollingOptions = {}) {
  const { timeoutMs = DEFAULT_POLL_TIMEOUT_MS } = options

  const controllers = useRef(new Map<string, AbortController>())
  const mountedRef = useRef(true)
  const [activeCount, setActiveCount] = useState(0)

  const stopPolling = useCallback((jobId?: string) => {
    if (jobId) {
      controllers.current.get(jobId)?.abort()
      return
    }
    controllers.current.forEach((controller) => controller.abort())
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const running = controllers.current
    return () => {
      mountedRef.current = false
      running.forEach((controller) => controller.abort())
    }
  }, [])

  const pollJob = useCallback(
    async (
      jobId: string,
      onUpdate?: (job: NormalizedJob) => void,
      pollOptions: { timeoutMs?: number } = {}
    ): Promise<PollResult> => {
      // Polling the same job twice replaces the first poll; other jobs are untouched.
      controllers.current.get(jobId)?.abort()
      const controller = new AbortController()
      controllers.current.set(jobId, controller)
      setActiveCount(controllers.current.size)

      try {
        return await pollJobUntilDone(jobId, {
          timeoutMs: pollOptions.timeoutMs ?? timeoutMs,
          signal: controller.signal,
          onUpdate,
        })
      } finally {
        if (controllers.current.get(jobId) === controller) {
          controllers.current.delete(jobId)
        }
        if (mountedRef.current) setActiveCount(controllers.current.size)
      }
    },
    [timeoutMs]
  )

  const resumeActiveJobs = useCallback(
    (filter?: ActiveJobFilter) => fetchActiveJobs(filter),
    []
  )

  return {
    isPolling: activeCount > 0,
    pollJob,
    stopPolling,
    resumeActiveJobs,
  }
}
