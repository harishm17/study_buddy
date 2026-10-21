import Link from 'next/link'
import { ArrowRight, CalendarCheck, Check, Circle, Gear } from '@phosphor-icons/react/dist/ssr'
import { Page, PageIntro } from '@/components/shell/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineAlert } from '@/components/ui/inline-alert'
import { weekStart, type Plan, type PlanDay } from '@/lib/learning/plan'
import { dayLabel, describePlanItem, weekLabel, type DescribedPlanItem } from '@/lib/learning/plan-copy'
import { minutesLabel } from '@/lib/learning/plan-settings'
import { cn } from '@/lib/utils'
import { pluralize } from '@/lib/format'

/** A long plan keeps the first weeks and the last (final weeks before an exam) open and folds the middle. */
const FIRST_WEEKS_OPEN = 3
const LAST_WEEKS_OPEN = 2

type Week = { start: string; days: PlanDay[] }

/** Days grouped into weeks that start on Monday. */
export function groupWeeks(days: PlanDay[]): Week[] {
  const weeks: Week[] = []
  for (const day of days) {
    const start = weekStart(day.date)
    const last = weeks[weeks.length - 1]
    if (last && last.start === start) last.days.push(day)
    else weeks.push({ start, days: [day] })
  }
  return weeks
}

function ItemRow({ item, today }: { item: DescribedPlanItem; today: boolean }) {
  const meta = [item.partLabel, item.done ? null : item.etaLabel.replace('About ', '')].filter(Boolean).join(', ')
  return (
    <li className="flex min-h-11 items-start gap-3 py-2">
      <span className="mt-0.5 inline-flex shrink-0" role="img" aria-label={item.done ? 'Done' : 'To do'}>
        {item.done ? (
          <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-fg">
            <Check weight="bold" className="size-3" aria-hidden="true" />
          </span>
        ) : (
          <Circle className="size-5 text-fg-3" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={item.href}
          className={cn('rounded-chip text-body-strong hover:underline', item.done ? 'text-fg-3' : 'text-fg')}
        >
          {item.title}
        </Link>
        {!item.done ? <p className="text-small text-fg-2">{item.reason}</p> : null}
        {meta ? <p className="text-caption font-normal text-fg-3">{meta}</p> : null}
      </div>
      {today && !item.done ? (
        <Button asChild size="sm" variant="secondary" className="shrink-0">
          <Link href={item.href} aria-label={`${item.verb}: ${item.title}`}>
            {item.verb}
          </Link>
        </Button>
      ) : null}
    </li>
  )
}

function DayCard({ courseId, day }: { courseId: string; day: PlanDay }) {
  const items = day.items.map((item) => describePlanItem(item, courseId))
  const headingId = `day-${day.date}`
  return (
    <li
      aria-labelledby={headingId}
      aria-current={day.isToday ? 'date' : undefined}
      className={cn(
        'rounded-card border bg-surface p-4 sm:grid sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-x-5',
        day.isToday ? 'border-accent ring-1 ring-accent/30' : 'border-border'
      )}
    >
      <div className="mb-2 sm:mb-0">
        <h3 id={headingId} className="text-body-strong text-fg">
          {dayLabel(day.date)}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {day.isToday ? <Badge tone="accent">Today</Badge> : null}
          {day.isExamDay ? <Badge tone="warning">Exam day</Badge> : null}
          {day.isFinalReview && !day.isExamDay ? <Badge tone="neutral">Final review</Badge> : null}
        </div>
        {day.minutes + day.doneMinutes > 0 ? (
          <p className="mt-1 text-caption font-normal tabular text-fg-3">
            {day.isToday && day.doneMinutes > 0
              ? `${day.doneMinutes} min done, ${day.minutes} to go`
              : `About ${day.minutes + day.doneMinutes} min`}
          </p>
        ) : null}
      </div>
      {items.length > 0 ? (
        <ul className="min-w-0 divide-y divide-border">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} today={day.isToday} />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-small text-fg-3">Nothing planned. A good day to rest.</p>
      )}
    </li>
  )
}

function WeekSection({ courseId, week, current }: { courseId: string; week: Week; current: boolean }) {
  const headingId = `week-${week.start}`
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 text-heading text-fg">
        {current ? 'This week' : weekLabel(week.start)}
        {current ? <span className="ml-2 text-small font-normal text-fg-3">{weekLabel(week.start)}</span> : null}
      </h2>
      {week.days.every((day) => day.items.length === 0 && !day.isToday) ? (
        <p className="rounded-card border border-border bg-surface p-4 text-small text-fg-3">
          Nothing planned this week. A good time to rest or catch up.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {week.days.map((day) => (
            <DayCard key={day.date} courseId={courseId} day={day} />
          ))}
        </ol>
      )}
    </section>
  )
}

function summaryLine(plan: Plan): string {
  const minutes = `${minutesLabel(plan.dailyMinutes)} a day`
  if (plan.mode === 'exam' && plan.daysToExam !== null) {
    const when =
      plan.daysToExam === 0
        ? 'Your exam is today'
        : plan.daysToExam === 1
          ? 'Your exam is tomorrow'
          : `Your exam is in ${plan.daysToExam} days`
    return `${when}, ${dayLabel(plan.examDate as string, { long: true })}. Planned for ${minutes}.`
  }
  return `The next 14 days, planned for ${minutes}. Set your exam date to plan up to it.`
}

/** The study plan: a week by week list of what to do each day, today highlighted. */
export function PlanView({ courseId, plan }: { courseId: string; plan: Plan }) {
  const base = `/courses/${courseId}`
  const settings = (
    <Button asChild variant="secondary" icon={<Gear />}>
      <Link href={`${base}/settings`}>Exam date and time</Link>
    </Button>
  )

  if (plan.status === 'no_topics') {
    return (
      <Page>
        <PageIntro title="Plan" description="What to study each day." />
        <EmptyState
          icon={<CalendarCheck />}
          title="Your plan starts with your topics"
          action={
            <Button asChild variant="primary">
              <Link href={`${base}/topics`}>Go to topics</Link>
            </Button>
          }
        >
          Add your materials and confirm the topics, then Margins plans your days.
        </EmptyState>
      </Page>
    )
  }

  if (plan.status === 'exam_passed') {
    return (
      <Page>
        <PageIntro title="Plan" description="What to study each day." actions={settings} />
        <InlineAlert
          tone="neutral"
          title="Your exam date has passed"
          action={
            <Button asChild size="sm" variant="primary">
              <Link href={`${base}/settings`}>Change the date</Link>
            </Button>
          }
        >
          Set a new date to plan your days again.
        </InlineAlert>
      </Page>
    )
  }

  const weeks = groupWeeks(plan.days)
  const thisWeek = weekStart(plan.today)
  const lastOpen = plan.mode === 'exam' ? LAST_WEEKS_OPEN : 0
  const head = weeks.slice(0, FIRST_WEEKS_OPEN)
  const folded = weeks.slice(FIRST_WEEKS_OPEN, Math.max(FIRST_WEEKS_OPEN, weeks.length - lastOpen))
  const tail = weeks.slice(head.length + folded.length)
  const anyItems = plan.days.some((day) => day.items.length > 0)
  const notScheduled = plan.notScheduled

  return (
    <Page>
      <PageIntro title="Plan" description={summaryLine(plan)} actions={settings} />

      <div className="flex flex-col gap-4">
        {plan.short && plan.shortMessage ? (
          <InlineAlert tone="warning" title="Time is short">
            {plan.shortMessage.replace(/^Time is short\.\s*/, '')}
          </InlineAlert>
        ) : null}
        {plan.unitMocksSkipped && !plan.short ? (
          <InlineAlert tone="neutral">
            The mock exams after each unit are left out so every topic fits before your exam.
          </InlineAlert>
        ) : null}
        {plan.mockNote && !(plan.short && plan.fullMocksReduced) ? <InlineAlert tone="neutral">{plan.mockNote}</InlineAlert> : null}
        {notScheduled ? (
          <section aria-labelledby="not-scheduled-heading" className="rounded-card border border-border bg-surface p-4">
            <h2 id="not-scheduled-heading" className="text-body-strong text-fg">
              Not scheduled: {pluralize(notScheduled.topics.length, 'topic')}
            </h2>
            <p className="mt-1 text-small text-fg-2">
              {notScheduled.reason === 'short'
                ? 'There is not enough time before your exam for these. Add study time or move the date to fit them in.'
                : 'These come after the days shown here.'}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {notScheduled.topics.map((topic) => (
                <li key={topic.id}>
                  <Link
                    href={`${base}/topics/${topic.id}`}
                    className="inline-flex min-h-7 items-center rounded-chip bg-surface-2 px-2 text-small text-fg-2 hover:text-fg"
                  >
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {!anyItems ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="You're all caught up"
          action={
            <Button asChild variant="primary" icon={<ArrowRight />}>
              <Link href={`${base}/exams/new`}>New mock exam</Link>
            </Button>
          }
        >
          Nothing is due. A mock exam is a good way to find what to look at next.
        </EmptyState>
      ) : (
        <div className="mt-6 flex flex-col gap-10">
          {head.map((week) => (
            <WeekSection key={week.start} courseId={courseId} week={week} current={week.start === thisWeek} />
          ))}
          {folded.length > 0 ? (
            <details>
              <summary className="cursor-pointer rounded-chip text-heading text-fg">
                Weeks in between <span className="text-small font-normal text-fg-3">({pluralize(folded.length, 'week')})</span>
              </summary>
              <div className="mt-6 flex flex-col gap-10">
                {folded.map((week) => (
                  <WeekSection key={week.start} courseId={courseId} week={week} current={false} />
                ))}
              </div>
            </details>
          ) : null}
          {tail.map((week) => (
            <WeekSection key={week.start} courseId={courseId} week={week} current={false} />
          ))}
        </div>
      )}
    </Page>
  )
}
