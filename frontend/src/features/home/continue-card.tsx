import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import type { ContinueAction } from '@/server/queries/continue'

/** The top Up next action of the most recently updated course. */
export function ContinueCard({ data }: { data: ContinueAction }) {
  const { course, action } = data
  return (
    <section
      aria-labelledby="continue-heading"
      className="flex flex-col gap-4 rounded-card border border-l-[3px] border-border border-l-accent-soft bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div className="min-w-0">
        <h2 id="continue-heading" className="flex items-baseline gap-2 text-small text-fg-2">
          <span className="font-medium text-accent-soft-fg">Continue</span>
          <Link href={`/courses/${course.id}`} className="truncate rounded-chip hover:text-fg hover:underline">
            {course.name}
          </Link>
        </h2>
        <p className="mt-1.5 truncate text-heading text-fg">{action.title}</p>
        <p className="mt-1 text-small text-fg-2">
          {action.reason} {action.etaLabel}.
        </p>
      </div>
      <Button asChild variant="primary" size="lg" className="shrink-0 self-start sm:self-center">
        <Link href={action.href}>
          Continue
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </section>
  )
}
