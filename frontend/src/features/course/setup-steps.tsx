'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { JobStatus } from '@/components/ui/job-status'
import { FailureList, GenerationProgress, useGenerationProgress } from './building-content'
import { useExtraction } from './extraction'
import { pluralize } from '@/lib/format'
import type { GenerationState, JobRef } from '@/server/queries/course'

/** Step 2 content: topics being found, to review, or waiting on files. */
export function CheckTopicsStep({
  courseId,
  extractJob,
  extractFailure,
  topicCount,
  filesProcessing,
  filesRead,
  filesTotal,
}: {
  courseId: string
  extractJob: JobRef | null
  extractFailure: string | null
  topicCount: number
  filesProcessing: boolean
  /** Files that have been read, and all files, for "1 of 2 read" while the others are in progress. */
  filesRead: number
  filesTotal: number
}) {
  const router = useRouter()
  const extraction = useExtraction(courseId, extractJob)
  const foundRef = React.useRef<HTMLDivElement>(null)
  const wasWaiting = React.useRef(topicCount === 0)

  // The step above keeps its size, so when the topics arrive the next action can be below the fold on a
  // phone. Bring it into view once, only if it is not already, and only when it arrived while the student waited.
  React.useEffect(() => {
    if (topicCount === 0) {
      wasWaiting.current = true
      return
    }
    if (!wasWaiting.current) return
    wasWaiting.current = false
    const element = foundRef.current
    if (!element) return
    const box = element.getBoundingClientRect()
    if (box.top >= 0 && box.bottom <= window.innerHeight) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  }, [topicCount])

  // The AI service starts topic finding a moment after the last file is read; look for it for a minute.
  const waitingForJob = !extraction.running && !extraction.failed && topicCount === 0 && !filesProcessing
  React.useEffect(() => {
    if (!waitingForJob) return
    const timer = setInterval(() => router.refresh(), 4000)
    const stop = setTimeout(() => clearInterval(timer), 60_000)
    return () => {
      clearInterval(timer)
      clearTimeout(stop)
    }
  }, [waitingForJob, router])

  // Every state below sits in the same frame, tall enough for the tallest (a line and a button), so
  // the step under it does not move when the state changes from waiting to topics found.
  const frame = 'mt-3 min-h-24'

  if (extraction.running || extraction.failed) {
    return (
      <div className={`${frame} rounded-control bg-surface-2 px-3.5 py-3`}>
        <JobStatus
          job={extraction.job}
          label="Finding topics"
          since={extraction.since}
          timedOut={extraction.timedOut}
          onRetry={extraction.start}
          retrying={extraction.starting}
        />
      </div>
    )
  }

  if (topicCount > 0) {
    return (
      <div ref={foundRef} role="status" className={frame}>
        <p className="text-small text-fg-2">
          We found {pluralize(topicCount, 'topic')} in your files. Rename, merge or remove any, then confirm.
        </p>
        <Button asChild variant="primary" className="mt-3">
          <Link href={`/courses/${courseId}/topics?edit=1`}>Review topics</Link>
        </Button>
      </div>
    )
  }

  if (filesProcessing) {
    return (
      <div className={frame}>
        <p className="text-small text-fg-2">
          Waiting for your files: <span className="tabular">{filesRead}</span> of <span className="tabular">{filesTotal}</span> read.
          Topics are found as soon as the last one is.
        </p>
      </div>
    )
  }

  return (
    <div className={frame}>
      {extractFailure ? <p className="mb-3 text-small text-danger-soft-fg">{extractFailure}</p> : null}
      <p className="text-small text-fg-2">Margins reads your files and suggests a topic list.</p>
      <Button variant="primary" className="mt-3" onClick={extraction.start} loading={extraction.starting}>
        Find topics
      </Button>
    </div>
  )
}

/**
 * Step 3 content: a link to the first topic. Content is written when a topic is opened, so there
 * is nothing to build here; the progress shows while the first topic is being written.
 */
export function StartStudyingStep({
  courseId,
  firstTopic,
  generation,
}: {
  courseId: string
  firstTopic: { id: string; name: string } | null
  generation: GenerationState
}) {
  const { active, readyNow, total, refresh } = useGenerationProgress(courseId, generation)

  return (
    <div className="mt-3 flex flex-col gap-3">
      {active > 0 ? <GenerationProgress readyNow={readyNow} total={total} /> : null}
      <FailureList failures={generation.failures} onRetried={refresh} />
      <div>
        <Button asChild variant="primary">
          <Link href={firstTopic ? `/courses/${courseId}/topics/${firstTopic.id}` : `/courses/${courseId}/topics`}>
            {firstTopic ? `Start ${firstTopic.name}` : 'Open topics'}
          </Link>
        </Button>
        <p className="mt-2 text-caption font-normal text-fg-3">
          The notes are written when you open a topic, which takes about a minute.
        </p>
      </div>
    </div>
  )
}
