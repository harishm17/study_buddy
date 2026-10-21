import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { DueLabel } from '@/components/ui/relative-time'
import { masteryLevel, masteryTone } from '@/lib/mastery'
import type { DueReview } from '@/server/queries/reviews'

/** Topics due for review across courses: up to five rows, then "and N more". */
export function DueReviews({ items, total }: { items: DueReview[]; total: number }) {
  if (items.length === 0) return null
  const more = total - items.length
  return (
    <section aria-labelledby="due-heading">
      <h2 id="due-heading" className="text-heading text-fg">
        Due for review <span className="tabular text-fg-2">({total})</span>
      </h2>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {items.map((item) => {
          const level = masteryLevel(item.mastery)
          return (
            <li key={item.topicId} className="flex min-h-14 items-center gap-3 py-2">
              <ProgressRing size={16} value={item.mastery} tone={masteryTone(level) === 'warning' ? 'warning' : 'accent'} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                <Link
                  href={`/courses/${item.courseId}/topics/${item.topicId}?view=quiz`}
                  className="min-w-0 truncate rounded-chip text-body-strong text-fg hover:underline sm:w-64 sm:flex-none"
                >
                  {item.topicName}
                </Link>
                <span className="min-w-0 flex-1 truncate text-small text-fg-3">{item.courseName}</span>
                <DueLabel dueAt={item.dueAt} className="text-small" />
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link
                  href={`/courses/${item.courseId}/topics/${item.topicId}?view=quiz`}
                  aria-label={`Review ${item.topicName}`}
                >
                  Review
                </Link>
              </Button>
            </li>
          )
        })}
      </ul>
      {more > 0 ? <p className="mt-3 text-small text-fg-2">and {more} more</p> : null}
    </section>
  )
}
