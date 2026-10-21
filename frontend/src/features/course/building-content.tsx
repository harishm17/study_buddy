'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toaster'
import { useActiveJobs } from '@/features/jobs/use-active-jobs'
import { apiFetch, isApiError } from '@/lib/api/client'
import { useResetTime } from '@/lib/budget/use-reset-time'
import { cn } from '@/lib/utils'
import type { GenerationState } from '@/server/queries/course'

const UNAVAILABLE = "Study content can't be created right now. Try again in a few minutes."

type MissingResponse = { status?: string; queuedJobs: number; skippedActive: number; failedJobs: number; message: string }

/** Starts the missing notes, examples, practice and quizzes for every confirmed topic. */
export function useGenerateMissing(courseId: string) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const run = React.useCallback(async () => {
    setPending(true)
    try {
      const result = await apiFetch<MissingResponse>(`/api/projects/${courseId}/generate-missing-content`, { method: 'POST' })
      if (result.queuedJobs === 0 && result.skippedActive === 0) {
        toast(result.failedJobs > 0 ? "Couldn't start writing. Try again." : 'All the study content is already written.')
      }
      router.refresh()
    } catch (error) {
      toast.error(isApiError(error) ? (error.status === 503 ? UNAVAILABLE : error.message) : UNAVAILABLE)
    } finally {
      setPending(false)
    }
  }, [courseId, router])

  return { run, pending }
}

export function GenerateMissingButton({
  courseId,
  children,
  ...props
}: { courseId: string; children: React.ReactNode } & Omit<ButtonProps, 'onClick' | 'loading' | 'children'>) {
  const { run, pending } = useGenerateMissing(courseId)
  return (
    <Button {...props} onClick={run} loading={pending}>
      {children}
    </Button>
  )
}

/** A compact "Then" row in the Up next card that runs generation in place. */
export function GenerateMissingRow({
  courseId,
  title,
  etaLabel,
}: {
  courseId: string
  title: string
  etaLabel: string
}) {
  const { run, pending } = useGenerateMissing(courseId)
  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors duration-120 hover:bg-surface-2 disabled:opacity-60"
    >
      <span className="min-w-0 flex-1 truncate text-body text-fg">{title}</span>
      <span className="shrink-0 text-caption font-normal text-fg-3">{etaLabel}</span>
      {pending ? <Spinner className="size-4 text-fg-3" /> : <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-fg-3" />}
    </button>
  )
}

/** "Writing content, 18 of 48 ready" from the running jobs plus what already exists. */
export function useGenerationProgress(courseId: string, generation: GenerationState) {
  const router = useRouter()
  const { jobs, ready, refresh } = useActiveJobs({ courseId, types: ['generate_content'] })
  const active = ready ? jobs.length : generation.activeJobs

  // Blocks that are neither written nor running (failed, or not started): fixed until the next refresh.
  const idle = Math.max(0, generation.totalBlocks - generation.readyBlocks - generation.activeJobs)
  const readyNow = Math.max(0, Math.min(generation.totalBlocks, generation.totalBlocks - active - idle))

  // A job finished: read the new content from the server (this also flips a course that just got
  // its first block from the setup guide to the Today view).
  const previous = React.useRef(active)
  React.useEffect(() => {
    if (active < previous.current) router.refresh()
    previous.current = active
  }, [active, router])

  return { active, readyNow, total: generation.totalBlocks, refresh }
}

/** The aggregate progress line and bar, used by setup step 3 and the building panel. */
export function GenerationProgress({
  readyNow,
  total,
  className,
}: {
  readyNow: number
  total: number
  className?: string
}) {
  const percent = total === 0 ? 0 : Math.round((readyNow / total) * 100)
  return (
    <div aria-live="polite" className={cn('w-full', className)}>
      <div className="flex items-center gap-2.5">
        <Spinner className="text-accent" />
        <p className="min-w-0 flex-1 text-body-strong text-fg">
          Writing content, <span className="tabular">{readyNow}</span> of <span className="tabular">{total}</span> ready
        </p>
      </div>
      <Progress aria-label="Study content progress" className="mt-2.5" value={percent} indeterminate={percent === 0} />
    </div>
  )
}

function FailureRow({
  failure,
  onRetried,
}: {
  failure: GenerationState['failures'][number]
  onRetried: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const message = useResetTime(failure.message)

  async function retry() {
    setPending(true)
    try {
      await apiFetch(`/api/topics/${failure.topicId}/generate-content`, {
        method: 'POST',
        json: { contentType: failure.contentType },
      })
      onRetried()
      router.refresh()
    } catch (error) {
      toast.error(isApiError(error) ? (error.status === 503 ? UNAVAILABLE : error.message) : UNAVAILABLE)
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <WarningCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
      <p className="min-w-0 flex-1 text-small text-fg-2">{message}</p>
      <Button size="sm" variant="secondary" onClick={retry} loading={pending}>
        Try again
      </Button>
    </li>
  )
}

/** Failed blocks, each with a way to try again. */
export function FailureList({
  failures,
  onRetried,
  limit = 4,
}: {
  failures: GenerationState['failures']
  onRetried: () => void
  limit?: number
}) {
  if (failures.length === 0) return null
  const rest = failures.length - limit
  return (
    <div>
      <ul className="divide-y divide-border">
        {failures.slice(0, limit).map((failure) => (
          <FailureRow key={failure.jobId} failure={failure} onRetried={onRetried} />
        ))}
      </ul>
      {rest > 0 ? <p className="border-t border-border pt-2.5 text-small text-fg-2">and {rest} more</p> : null}
    </div>
  )
}

/** Only while content is being written or something failed: progress and a way to retry. */
export function BuildingContent({ courseId, generation }: { courseId: string; generation: GenerationState }) {
  const { active, readyNow, total, refresh } = useGenerationProgress(courseId, generation)
  if (active === 0 && generation.failures.length === 0) return null

  return (
    <Card compact className="flex flex-col gap-3" aria-labelledby="building-heading" role="region">
      <h2 id="building-heading" className="text-subheading text-fg">
        Building content
      </h2>
      {active > 0 ? <GenerationProgress readyNow={readyNow} total={total} /> : null}
      <FailureList failures={generation.failures} onRetried={refresh} />
    </Card>
  )
}
