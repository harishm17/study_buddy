import Link from 'next/link'
import { CheckCircle } from '@phosphor-icons/react/dist/ssr'
import { MasteryIndicator } from '@/components/ui/mastery-indicator'
import { DueLabel } from '@/components/ui/relative-time'
import { formatDate, pluralize } from '@/lib/format'
import { fadeNote as describeFade } from '@/lib/learning/consequence'
import { ReviewActions } from '@/features/topic/review-actions'
import type { ReviewPageData, ReviewTopic } from '@/server/queries/review'

/** The topic is the first on the list, so its button is the one filled button on the page. */
function DueCard({ courseId, topic, first }: { courseId: string; topic: ReviewTopic; first: boolean }) {
  const headingId = `review-title-${topic.id}`
  const fade = describeFade({ earned: topic.earnedMastery, shown: topic.mastery, daysLate: topic.daysLate })
  return (
    <li
      id={`review-${topic.id}`}
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-card border border-border bg-surface p-4 target:border-accent target:ring-1 target:ring-accent/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h3 id={headingId} className="min-w-0 text-body-strong text-fg">
          <Link
            href={`/courses/${courseId}/topics/${topic.id}`}
            className="inline-flex min-h-6 items-center rounded-chip hover:underline max-sm:min-h-11"
          >
            {topic.name}
          </Link>
        </h3>
        <DueLabel dueAt={topic.dueAt} className="text-small max-sm:pb-1" />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-2">
        <MasteryIndicator mastery={topic.mastery} showPercent className="text-small" />
        <span>
          {topic.missedCount > 0
            ? `You missed ${pluralize(topic.missedCount, 'question')} lately.`
            : 'No missed questions to retry.'}
        </span>
      </div>
      {fade ? <p className="mt-1 text-caption font-normal text-fg-3">{fade}</p> : null}
      <div className="mt-3">
        <ReviewActions
          courseId={courseId}
          topicId={topic.id}
          missedCount={topic.missedCount}
          topicName={topic.name}
          size="sm"
          emphasis={first}
        />
      </div>
    </li>
  )
}

/**
 * The topics due for review, each with "Retry what you missed" (when there is something to retry) and
 * "New questions". One button on the page is filled: the first topic's main action. The rest are
 * outlined, so the most overdue topic is where to start.
 */
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
          <>
            <p className="mt-1 text-small text-fg-2">
              Most overdue first. Score 70% or more and the next review moves out; below that it comes back tomorrow.
            </p>
            <ul className="mt-3 flex flex-col gap-3">
              {data.due.map((topic, index) => (
                <DueCard key={topic.id} courseId={courseId} topic={topic} first={index === 0} />
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-3 flex items-start gap-3 rounded-card border border-border bg-surface p-4">
            <CheckCircle aria-hidden="true" weight="fill" className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <h3 className="text-body-strong text-fg">Nothing is due</h3>
              <p className="mt-0.5 text-small text-fg-2">
                {next
                  ? `Your next review is ${next.name}, on ${formatDate(next.dueAt)}.`
                  : 'Reviews appear here a few days after you take a quiz.'}
              </p>
            </div>
          </div>
        )}
      </section>

      {data.upcoming.length > 0 ? (
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="text-heading text-fg">
            Coming up
          </h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {data.upcoming.map((topic) => (
              <li key={topic.id} id={`review-${topic.id}`} className="flex min-h-12 items-center gap-3 py-1 max-sm:min-h-14">
                <MasteryIndicator mastery={topic.mastery} variant="ring" />
                <Link
                  href={`/courses/${courseId}/topics/${topic.id}?view=quiz`}
                  className="inline-flex min-h-6 min-w-0 flex-1 items-center truncate rounded-chip text-body-strong text-fg hover:underline max-sm:min-h-11"
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
