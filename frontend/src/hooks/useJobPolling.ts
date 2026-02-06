'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type NormalizedJobState = 'queued' | 'processing' | 'completed' | 'failed'

export type NormalizedJob = {
  id: string
  status: NormalizedJobState
  progressPercent: number
  stage?: string | null
  errorMessage?: string | null
  errorCode?: string | null
  retryable?: boolean
  raw: Record<string, unknown>
}

type UseJobPollingOptions = {
  timeoutMs?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
}

type PollResult = {
  state: 'completed' | 'failed' | 'timeout'
  job?: NormalizedJob
  error?: string
}

const normalizeStatus = (value: unknown): NormalizedJobState => {
  const status = String(value || '').toLowerCase()
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'processing') return 'processing'
  return 'queued'
}

const normalizeJob = (data: Record<string, unknown>): NormalizedJob => ({
  id: String(data.id || ''),
  status: normalizeStatus(data.status),
  progressPercent: Number(data.progressPercent || 0),
  stage: data.stage ? String(data.stage) : null,
  errorMessage: data.errorMessage ? String(data.errorMessage) : null,
  errorCode: data.errorCode ? String(data.errorCode) : null,
  retryable: typeof data.retryable === 'boolean' ? data.retryable : undefined,
  raw: data,
})

export function useJobPolling(options: UseJobPollingOptions = {}) {
  const {
    timeoutMs = 120_000,
    initialDelayMs = 1_000,
    maxDelayMs = 8_000,
    backoffFactor = 1.4,
  } = options

  const [isPolling, setIsPolling] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const waitResolverRef = useRef<(() => void) | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const activePollingRef = useRef(false)

  const stopPolling = useCallback(() => {
    activePollingRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (waitResolverRef.current) {
      waitResolverRef.current()
      waitResolverRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsPolling(false)
  }, [])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      stopPolling()
    }
  }, [stopPolling])

  const pollJob = useCallback(
    async (
      jobId: string,
      onUpdate?: (job: NormalizedJob) => void
    ): Promise<PollResult> => {
      stopPolling()
      activePollingRef.current = true
      setIsPolling(true)

      const startedAt = Date.now()
      let delayMs = initialDelayMs

      while (mountedRef.current && activePollingRef.current) {
        if (Date.now() - startedAt > timeoutMs) {
          stopPolling()
          return { state: 'timeout', error: 'Job timed out before completion' }
        }

        const jitter = Math.floor(Math.random() * Math.min(500, delayMs * 0.15))
        const wait = delayMs + jitter
        await new Promise<void>((resolve) => {
          waitResolverRef.current = resolve
          timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null
            waitResolverRef.current = null
            resolve()
          }, wait)
        })

        if (!activePollingRef.current || !mountedRef.current) {
          stopPolling()
          return { state: 'failed', error: 'Polling cancelled' }
        }

        abortRef.current = new AbortController()

        try {
          const response = await fetch(`/api/jobs/${jobId}`, {
            signal: abortRef.current.signal,
          })
          if (!response.ok) {
            const text = await response.text()
            stopPolling()
            return {
              state: 'failed',
              error: text || `Failed to fetch job status (${response.status})`,
            }
          }

          const payload = (await response.json()) as Record<string, unknown>
          const job = normalizeJob(payload)
          onUpdate?.(job)

          if (job.status === 'completed') {
            stopPolling()
            return { state: 'completed', job }
          }

          if (job.status === 'failed') {
            stopPolling()
            return {
              state: 'failed',
              job,
              error: job.errorMessage || 'Job failed',
            }
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            stopPolling()
            return { state: 'failed', error: 'Polling aborted' }
          }
        } finally {
          abortRef.current = null
        }

        delayMs = Math.min(Math.floor(delayMs * backoffFactor), maxDelayMs)
      }

      stopPolling()
      return { state: 'failed', error: 'Polling cancelled' }
    },
    [backoffFactor, initialDelayMs, maxDelayMs, stopPolling, timeoutMs]
  )

  return {
    isPolling,
    pollJob,
    stopPolling,
  }
}
