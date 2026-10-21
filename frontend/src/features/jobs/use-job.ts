'use client'

import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_POLL_TIMEOUT_MS,
  pollJobUntilDone,
  type NormalizedJob,
  type PollResult,
} from '@/lib/jobs/poll-job'

type UseJobOptions = {
  /** Visible time to wait before giving up with `timedOut` (the job keeps running). */
  timeoutMs?: number
  /** Called once when polling ends: completed, failed or timed out (not when cancelled). */
  onSettled?: (result: PollResult) => void
}

export type UseJobState = {
  job: NormalizedJob | null
  result: PollResult | null
  /** True while polling. */
  active: boolean
  timedOut: boolean
}

const IDLE: UseJobState = { job: null, result: null, active: false, timedOut: false }

/**
 * Follow one job until it finishes. Pass null to do nothing. Polling backs off, pauses in a
 * hidden tab and stops on unmount or when the id changes. Resume after a refresh by finding
 * the id with `useActiveJobs`.
 */
export function useJob(jobId: string | null | undefined, options: UseJobOptions = {}): UseJobState {
  const { timeoutMs = DEFAULT_POLL_TIMEOUT_MS } = options
  const [state, setState] = useState<{ id: string | null; value: UseJobState }>({ id: null, value: IDLE })
  const settledRef = useRef(options.onSettled)

  useEffect(() => {
    settledRef.current = options.onSettled
  })

  useEffect(() => {
    if (!jobId) return
    const controller = new AbortController()
    pollJobUntilDone(jobId, {
      timeoutMs,
      signal: controller.signal,
      onUpdate: (job) => setState({ id: jobId, value: { job, result: null, active: true, timedOut: false } }),
    }).then((result) => {
      if (result.state === 'cancelled') return
      setState({
        id: jobId,
        value: { job: result.job ?? null, result, active: false, timedOut: result.state === 'timeout' },
      })
      settledRef.current?.(result)
    })
    return () => controller.abort()
  }, [jobId, timeoutMs])

  if (!jobId) return IDLE
  // State from a previous id is not this job's.
  return state.id === jobId ? state.value : { ...IDLE, active: true }
}
