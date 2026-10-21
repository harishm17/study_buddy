'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { JobStatus } from '@/components/ui/job-status'
import { FailureList, GenerateMissingButton, GenerationProgress, useGenerationProgress } from './building-content'
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
}: {
  courseId: string
  extractJob: JobRef | null
  extractFailure: string | null
  topicCount: number
  filesProcessing: boolean
}) {
  const router = useRouter()
  const extraction = useExtraction(courseId, extractJob)

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

  if (extraction.running || extraction.failed) {
    return (
      <div className="mt-3 rounded-control bg-surface-2 px-3.5 py-3">
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
      <div className="mt-3">
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
    return <p className="mt-3 text-small text-fg-2">Waiting for your files to finish processing.</p>
  }

  return (
    <div className="mt-3">
      {extractFailure ? <p className="mb-3 text-small text-danger-soft-fg">{extractFailure}</p> : null}
      <p className="text-small text-fg-2">Margins reads your files and suggests a topic list.</p>
      <Button variant="primary" className="mt-3" onClick={extraction.start} loading={extraction.starting}>
        Find topics
      </Button>
    </div>
  )
}

/** Step 3 content: the build button, or the aggregate progress while content is written. */
export function BuildContentStep({ courseId, generation }: { courseId: string; generation: GenerationState }) {
  const { active, readyNow, total, refresh } = useGenerationProgress(courseId, generation)

  return (
    <div className="mt-3 flex flex-col gap-3">
      {active > 0 ? <GenerationProgress readyNow={readyNow} total={total} /> : null}
      <FailureList failures={generation.failures} onRetried={refresh} />
      {active === 0 ? (
        <div>
          <GenerateMissingButton courseId={courseId} variant="primary">
            Build study content
          </GenerateMissingButton>
          <p className="mt-2 text-caption font-normal text-fg-3">
            Takes a few minutes. You can start reading as topics finish.
          </p>
        </div>
      ) : null}
    </div>
  )
}
