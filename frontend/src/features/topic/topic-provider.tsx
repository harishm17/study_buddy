'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toaster'
import { apiFetch, isApiError } from '@/lib/api/client'
import { describeJobFailure, parseContentTarget } from '@/lib/jobs/failure-message'
import { fetchActiveJobs, type NormalizedJob } from '@/lib/jobs/poll-job'
import { useJobPolling } from '@/features/jobs/use-job-polling'
import { KIND_COPY, PREFLIGHT_MESSAGE } from './copy'
import { CONTENT_KINDS, CONTENT_TYPE_BY_KIND, KIND_BY_CONTENT_TYPE, type ContentKind } from './types'
import type { GenerateMode } from './generate-preferences'

export type GenerationNotice = { message: string; tone: 'danger' | 'warning' }

export type RunningJob = {
  jobId: string
  job: NormalizedJob | null
  /** Epoch ms the work started, for the elapsed time. */
  since: number
  /** The poller stopped waiting; the job is still running on the server. */
  timedOut: boolean
  /** The job finished and the page is waiting for the refreshed content to arrive. */
  done: boolean
}

type TopicContextValue = {
  topicId: string
  courseId: string
  running: Partial<Record<ContentKind, RunningJob>>
  /** A failure to start a job (AI unavailable, daily budget) by kind. */
  startError: Partial<Record<ContentKind, GenerationNotice>>
  /** The latest job for this kind failed (from the server, or while this page was open). */
  failure: Partial<Record<ContentKind, GenerationNotice>>
  starting: Partial<Record<ContentKind, boolean>>
  generate: (kind: ContentKind, mode: GenerateMode, preferences: Record<string, unknown>) => Promise<boolean>
  dismiss: (kind: ContentKind) => void
  /** The number keys switch views, except while a quiz is being taken (they pick options). */
  keysSuspended: boolean
  setKeysSuspended: (suspended: boolean) => void
}

const TopicContext = React.createContext<TopicContextValue | null>(null)

export function useTopic(): TopicContextValue {
  const value = React.useContext(TopicContext)
  if (!value) throw new Error('useTopic must be used inside TopicProvider')
  return value
}

/** Generation state of one kind of content, with the action to start it. */
export function useGeneration(kind: ContentKind) {
  const topic = useTopic()
  return {
    running: topic.running[kind],
    failure: topic.failure[kind],
    startError: topic.startError[kind],
    starting: !!topic.starting[kind],
    generate: (mode: GenerateMode, preferences: Record<string, unknown>) =>
      topic.generate(kind, mode, preferences),
    dismiss: () => topic.dismiss(kind),
  }
}

function toNotice(error: unknown): GenerationNotice {
  if (isApiError(error)) {
    if (error.code === 'LLM_DAILY_BUDGET') return { message: error.message, tone: 'warning' }
    if (error.status === 503) return { message: PREFLIGHT_MESSAGE, tone: 'danger' }
    return { message: error.message, tone: 'danger' }
  }
  return { message: 'Something went wrong. Try again.', tone: 'danger' }
}

const failureNotice = (job: NormalizedJob): GenerationNotice => ({
  message: describeJobFailure(job.errorCode, job.errorMessage),
  tone: job.errorCode === 'LLM_DAILY_BUDGET' ? 'warning' : 'danger',
})

const JOB_TIMEOUT_MS = 180_000

type ProviderProps = {
  topicId: string
  courseId: string
  /** Changes when any content is rewritten (the refresh has landed). */
  contentVersion: string
  /** Failures the server found for kinds that still have no content. */
  initialFailures: Partial<Record<ContentKind, GenerationNotice>>
  children: React.ReactNode
}

/**
 * Everything on the topic page that outlives a view: background generation (started here or
 * found running after a refresh), its failures, and the keyboard lock for the quiz.
 *
 * A running job is followed with the shared poller. When it completes the page is refreshed
 * (the content is read on the server) and a quiet toast says it is ready; the "generating"
 * state stays up until the new content has arrived, so the view never flashes empty.
 */
export function TopicProvider({ topicId, courseId, contentVersion, initialFailures, children }: ProviderProps) {
  const router = useRouter()
  const { pollJob } = useJobPolling({ timeoutMs: JOB_TIMEOUT_MS })
  const [running, setRunning] = React.useState<TopicContextValue['running']>({})
  const [startError, setStartError] = React.useState<TopicContextValue['startError']>({})
  const [localFailure, setLocalFailure] = React.useState<TopicContextValue['failure']>({})
  const [starting, setStarting] = React.useState<TopicContextValue['starting']>({})
  const [keysSuspended, setKeysSuspended] = React.useState(false)
  const tracked = React.useRef(new Set<string>())

  // Failures from the server hold until a new run starts; ones seen here replace them.
  const [dismissed, setDismissed] = React.useState<ContentKind[]>([])
  const failure = React.useMemo(() => {
    const merged: TopicContextValue['failure'] = {}
    for (const kind of CONTENT_KINDS) {
      const notice = localFailure[kind] ?? (dismissed.includes(kind) ? undefined : initialFailures[kind])
      if (notice) merged[kind] = notice
    }
    return merged
  }, [localFailure, initialFailures, dismissed])

  const track = React.useCallback(
    (jobId: string, kind: ContentKind, since: number) => {
      if (tracked.current.has(jobId)) return
      tracked.current.add(jobId)
      setRunning((current) => ({ ...current, [kind]: { jobId, job: null, since, timedOut: false, done: false } }))

      void pollJob(jobId, (job) => {
        setRunning((current) =>
          current[kind]?.jobId === jobId ? { ...current, [kind]: { ...current[kind]!, job } } : current
        )
      }).then((result) => {
        if (result.state === 'cancelled') return
        if (result.state === 'completed') {
          setRunning((current) =>
            current[kind]?.jobId === jobId ? { ...current, [kind]: { ...current[kind]!, done: true } } : current
          )
          toast.success(KIND_COPY[kind].ready)
          React.startTransition(() => router.refresh())
          return
        }
        if (result.state === 'timeout') {
          setRunning((current) =>
            current[kind]?.jobId === jobId ? { ...current, [kind]: { ...current[kind]!, timedOut: true } } : current
          )
          return
        }
        // Failed.
        setRunning((current) => {
          if (current[kind]?.jobId !== jobId) return current
          const next = { ...current }
          delete next[kind]
          return next
        })
        const notice = result.job
          ? failureNotice(result.job)
          : { message: describeJobFailure(null), tone: 'danger' as const }
        setLocalFailure((current) => ({ ...current, [kind]: notice }))
        toast.error(`${KIND_COPY[kind].failed}. Open it to try again.`)
      })
    },
    [pollJob, router]
  )

  // Pick up work that was running before this page loaded.
  React.useEffect(() => {
    const controller = new AbortController()
    fetchActiveJobs({ projectId: courseId, jobTypes: ['generate_content'] }, controller.signal)
      .then((jobs) => {
        for (const job of jobs) {
          const targetKey = typeof job.raw.targetKey === 'string' ? job.raw.targetKey : null
          const target = parseContentTarget(targetKey)
          if (!target || target.topicId !== topicId) continue
          const kind = KIND_BY_CONTENT_TYPE[target.contentType]
          if (!kind) continue
          const startedAt = Date.parse(String(job.raw.startedAt ?? job.raw.createdAt ?? ''))
          track(job.id, kind, Number.isFinite(startedAt) ? startedAt : Date.now())
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [courseId, topicId, track])

  // Fresh content has arrived: stop showing the finished jobs.
  React.useEffect(() => {
    setRunning((current) => {
      const entries = Object.entries(current).filter(([, value]) => !value?.done)
      return entries.length === Object.keys(current).length ? current : (Object.fromEntries(entries) as typeof current)
    })
  }, [contentVersion])

  // If the refresh never lands (offline, say), do not stay on "Done" forever.
  React.useEffect(() => {
    const finished = Object.values(running).some((value) => value?.done)
    if (!finished) return
    const timer = setTimeout(() => {
      setRunning((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => !value?.done)))
    }, 6000)
    return () => clearTimeout(timer)
  }, [running])

  const generate = React.useCallback<TopicContextValue['generate']>(
    async (kind, mode, preferences) => {
      setStarting((current) => ({ ...current, [kind]: true }))
      setStartError((current) => ({ ...current, [kind]: undefined }))
      setLocalFailure((current) => ({ ...current, [kind]: undefined }))
      setDismissed((current) => [...current.filter((item) => item !== kind), kind])
      try {
        const endpoint = mode === 'create' ? 'generate-content' : 'regenerate-content'
        const response = await apiFetch<{ jobId: string | null }>(`/api/topics/${topicId}/${endpoint}`, {
          method: 'POST',
          json: { contentType: CONTENT_TYPE_BY_KIND[kind], preferences },
        })
        if (response.jobId) track(response.jobId, kind, Date.now())
        return true
      } catch (error) {
        setStartError((current) => ({ ...current, [kind]: toNotice(error) }))
        return false
      } finally {
        setStarting((current) => ({ ...current, [kind]: false }))
      }
    },
    [topicId, track]
  )

  const dismiss = React.useCallback((kind: ContentKind) => {
    setStartError((current) => ({ ...current, [kind]: undefined }))
    setLocalFailure((current) => ({ ...current, [kind]: undefined }))
    setDismissed((current) => [...current.filter((item) => item !== kind), kind])
  }, [])

  const value = React.useMemo<TopicContextValue>(
    () => ({
      topicId,
      courseId,
      running,
      startError,
      failure,
      starting,
      generate,
      dismiss,
      keysSuspended,
      setKeysSuspended,
    }),
    [topicId, courseId, running, startError, failure, starting, generate, dismiss, keysSuspended]
  )

  return <TopicContext.Provider value={value}>{children}</TopicContext.Provider>
}
