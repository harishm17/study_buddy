import Link from 'next/link'
import { CheckCircle } from '@phosphor-icons/react/dist/ssr'
import { EmptyState } from '@/components/ui/empty-state'
import { MasteryIndicator } from '@/components/ui/mastery-indicator'
import { DueLabel } from '@/components/ui/relative-time'
import { formatDate, pluralize } from '@/lib/format'
import { ReviewActions } from '@/features/topic/review-actions'
import type { ReviewPageData, ReviewTopic } from '@/server/queries/review'

function DueCard({ courseId, topic }: { courseId: string; topic: ReviewTopic }) {
  const headingId = `review-title-${topic.id}`
  return (
    <li
      id={`review-${topic.id}`}
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-card border border-border bg-surface p-4 target:border-accent target:ring-1 target:ring-accent/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h3 id={headingId} className="min-w-0 text-body-strong text-fg">
          <Link href={`/courses/${courseId}/topics/${topic.id}`} className="rounded-chip hover:underline">
            {topic.name}
          </Link>
        </h3>
        <DueLabel dueAt={topic.dueAt} className="text-small" />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-2">
        <MasteryIndicator mastery={topic.mastery} showPercent className="text-small" />
        <span>
          {topic.missedCount > 0
            ? `You missed ${pluralize(topic.missedCount, 'question')} lately.`
            : 'No missed questions to retry.'}
        </span>
      </div>
      <div className="mt-3">
        <ReviewActions courseId={courseId} topicId={topic.id} missedCount={topic.missedCount} topicName={topic.name} size="sm" />
      </div>
    </li>
  )
}

/** The topics due for review, each with "Retry what you missed" (when there is something to retry) and "Fresh review". */
export function ReviewList({ data }: { data: ReviewPageData }) {
  const courseId = data.course.id
  const next = data.upcoming[0]
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="due-heading">
        <h2 id="due-heading" className="text-heading text-fg">
          Due for review <span className="tabular text-fg-2">({data.due.length})</span>
        </h2>
        {data.due.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3">
            {data.due.map((topic) => (
              <DueCard key={topic.id} courseId={courseId} topic={topic} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<CheckCircle />} title="Nothing is due" className="py-8">
            {next ? `Your next review is ${next.name}, on ${formatDate(next.dueAt)}.` : 'Reviews appear here a few days after you take a quiz.'}
          </EmptyState>
        )}
      </section>

      {data.upcoming.length > 0 ? (
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="text-heading text-fg">
            Coming up
          </h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {data.upcoming.map((topic) => (
              <li key={topic.id} id={`review-${topic.id}`} className="flex min-h-12 items-center gap-3 py-2">
                <MasteryIndicator mastery={topic.mastery} variant="ring" />
                <Link
                  href={`/courses/${courseId}/topics/${topic.id}?view=quiz`}
                  className="min-w-0 flex-1 truncate rounded-chip text-body-strong text-fg hover:underline"
                >
                  {topic.name}
                </Link>
                <time dateTime={topic.dueAt} suppressHydrationWarning className="shrink-0 text-small text-fg-3">
                  {formatDate(topic.dueAt)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
