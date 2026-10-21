'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowCounterClockwise, Sparkle } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { InlineAlert } from '@/components/ui/inline-alert'
import { apiFetch, isApiError } from '@/lib/api/client'
import { useOptionalTopic } from './topic-provider'

type ReviewActionsProps = {
  courseId: string
  topicId: string
  /** Questions missed in the last two attempts. "Retry what you missed" is hidden when there are none. */
  missedCount: number
  /** For a name that tells the buttons apart when several are on one page. */
  topicName?: string
  size?: 'sm' | 'md'
}

/**
 * The two ways to review a topic that is due. "Retry what you missed" is a quiz of the questions
 * got wrong in the last two attempts (no model call). "Fresh review" writes a new 6-question set,
 * focused on what was missed and mixing in a question or two from a prerequisite topic. Both lead
 * to the topic's quiz; the attempt then updates mastery and the schedule like any quiz.
 */
export function ReviewActions({ courseId, topicId, missedCount, topicName, size = 'md' }: ReviewActionsProps) {
  const router = useRouter()
  const topic = useOptionalTopic()
  const [busy, setBusy] = React.useState<'retry' | 'fresh' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const quizHref = `/courses/${courseId}/topics/${topicId}?view=quiz`
  const suffix = topicName ? ` for ${topicName}` : ''

  async function retry() {
    setBusy('retry')
    setError(null)
    try {
      const { quizSetId } = await apiFetch<{ quizSetId: string }>(`/api/topics/${topicId}/retry-quiz`, { method: 'POST' })
      router.push(`${quizHref}&set=${quizSetId}&start=1`)
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : 'Could not prepare the retry. Try again.')
      setBusy(null)
    }
  }

  async function fresh() {
    setBusy('fresh')
    setError(null)
    try {
      if (topic) {
        // On the topic page the provider follows the job and shows the quiz being written.
        const started = await topic.generateReview()
        if (!started) setError(topic.startError.quiz?.message ?? 'Could not start the review. Try again.')
        setBusy(null)
        return
      }
      const { jobId } = await apiFetch<{ jobId: string | null }>(`/api/topics/${topicId}/fresh-review`, { method: 'POST' })
      // The topic page follows the job it is told about, even one that finishes before the page has loaded.
      router.push(jobId ? `${quizHref}&job=${jobId}` : quizHref)
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : 'Could not start the review. Try again.')
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {missedCount > 0 ? (
          <Button
            size={size}
            variant="primary"
            icon={<ArrowCounterClockwise />}
            loading={busy === 'retry'}
            disabled={busy === 'fresh'}
            onClick={retry}
            aria-label={`Retry what you missed${suffix}`}
          >
            Retry what you missed
          </Button>
        ) : null}
        <Button
          size={size}
          variant={missedCount > 0 ? 'secondary' : 'primary'}
          icon={<Sparkle />}
          loading={busy === 'fresh'}
          disabled={busy === 'retry'}
          onClick={fresh}
          aria-label={`Fresh review${suffix}`}
        >
          Fresh review
        </Button>
      </div>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
    </div>
  )
}
