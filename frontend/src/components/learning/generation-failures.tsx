'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useJobPolling } from '@/hooks/useJobPolling'
import { contentTypeLabel, describeJobFailure } from '@/lib/jobs/failure-message'

type Failure = {
  jobId: string
  topicId: string
  topicName: string
  contentType: string
  errorCode: string | null
  message: string
}

type Props = {
  projectId: string
  /** Bump this to look again, for example right after a batch was started. */
  version?: number
}

/**
 * Content blocks that failed to generate, with the topic, the reason and a retry button for
 * each. It also follows generation jobs that are still running and updates when they end, so
 * a failure shows up without a page reload.
 */
export function GenerationFailures({ projectId, version = 0 }: Props) {
  const [failures, setFailures] = useState<Failure[]>([])
  const [retrying, setRetrying] = useState<Set<string>>(new Set())
  const [retryError, setRetryError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const { pollJob, stopPolling, resumeActiveJobs } = useJobPolling({ timeoutMs: 300_000 })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopPolling()
    }
  }, [stopPolling])

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/generation-failures`, { cache: 'no-store' })
      if (!response.ok) return
      const payload = (await response.json()) as { failures?: Failure[] }
      if (mountedRef.current) setFailures(payload.failures ?? [])
    } catch {
      // Keep what is shown; the next load will try again.
    }
  }, [projectId])

  // Look now, then follow whatever is still generating and look again when it ends.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await load()
      const active = await resumeActiveJobs({ projectId, jobTypes: ['generate_content'] }).catch(() => [])
      if (cancelled || active.length === 0) return
      await Promise.all(active.map((job) => pollJob(job.id)))
      if (!cancelled) await load()
    })()
    return () => {
      cancelled = true
    }
  }, [load, pollJob, projectId, resumeActiveJobs, version])

  // Failures also appear when the student comes back to the tab.
  useEffect(() => {
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const retry = async (failure: Failure) => {
    setRetryError(null)
    setRetrying((current) => new Set(current).add(failure.jobId))
    try {
      const response = await fetch(`/api/topics/${failure.topicId}/generate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: failure.contentType }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || typeof payload?.jobId !== 'string') {
        const message = payload?.error?.message || payload?.error
        throw new Error(typeof message === 'string' ? message : 'Could not start generation.')
      }
      // The row stays, marked as retrying, until the job ends; then the list is read again and
      // shows the new reason if it failed again.
      const result = await pollJob(payload.jobId)
      if (!mountedRef.current) return
      if (result.state !== 'completed' && result.job?.errorCode) {
        setRetryError(
          `${failure.topicName}, ${contentTypeLabel(failure.contentType).toLowerCase()}: ${describeJobFailure(result.job.errorCode, result.job.errorMessage)}`
        )
      }
      await load()
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : 'Could not start generation.')
    } finally {
      if (mountedRef.current) {
        setRetrying((current) => {
          const next = new Set(current)
          next.delete(failure.jobId)
          return next
        })
      }
    }
  }

  if (failures.length === 0 && !retryError) return null

  return (
    <Card className="border-amber-300/70 bg-amber-50/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />
          Some content could not be generated
        </CardTitle>
        <CardDescription>
          {failures.length} block{failures.length === 1 ? '' : 's'} failed. Retry each one once the reason is dealt with.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite">
        {retryError && (
          <Alert variant="destructive">
            <AlertDescription>{retryError}</AlertDescription>
          </Alert>
        )}
        <ul className="space-y-2">
          {failures.map((failure) => {
            const busy = retrying.has(failure.jobId)
            return (
              <li
                key={failure.jobId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/70 bg-white/80 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    <Link
                      href={`/projects/${projectId}/topics/${failure.topicId}`}
                      className="hover:underline"
                    >
                      {failure.topicName}
                    </Link>
                    <span className="text-muted-foreground"> · {contentTypeLabel(failure.contentType)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{failure.message}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void retry(failure)}
                  disabled={busy}
                  aria-label={`Retry ${contentTypeLabel(failure.contentType).toLowerCase()} for ${failure.topicName}`}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="mr-2 h-3 w-3" aria-hidden="true" />
                  )}
                  {busy ? 'Retrying...' : 'Retry'}
                </Button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
