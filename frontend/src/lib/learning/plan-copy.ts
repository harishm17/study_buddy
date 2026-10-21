import type { Plan, PlanItem } from './plan'

/** A plan item in the words, button and link the UI shows. */
export type DescribedPlanItem = {
  id: string
  kind: PlanItem['kind']
  /** "Learn Sorting algorithms". */
  title: string
  /** One plain sentence on why or what. */
  reason: string
  /** The button label: Start, Take quiz, Review... */
  verb: string
  href: string
  /** "About 35 min". */
  etaLabel: string
  minutes: number
  done: boolean
  /** "Part 1 of 2", or null. */
  partLabel: string | null
}

const eta = (minutes: number) => `About ${minutes} min`

/** Where a plan item leads: the topic, its quiz, the review list or the mock exam form. */
export function planItemHref(item: PlanItem, courseId: string): string {
  const base = `/courses/${courseId}`
  switch (item.kind) {
    case 'learn':
      return item.topicId ? `${base}/topics/${item.topicId}` : `${base}/topics`
    case 'quiz':
      return item.topicId ? `${base}/topics/${item.topicId}?view=quiz` : `${base}/topics`
    case 'review':
      return item.topicId ? `${base}/review#review-${item.topicId}` : `${base}/review`
    case 'unit_mock':
      return item.topicIds.length > 0 ? `${base}/exams/new?topics=${item.topicIds.join(',')}` : `${base}/exams/new`
    case 'full_mock':
      return item.topicIds.length > 0 ? `${base}/exams/new?topics=all` : `${base}/exams`
  }
}

export function describePlanItem(item: PlanItem, courseId: string): DescribedPlanItem {
  const common = {
    id: item.id,
    kind: item.kind,
    title: item.title,
    href: planItemHref(item, courseId),
    etaLabel: eta(item.minutes),
    minutes: item.minutes,
    done: item.done,
    partLabel: item.part ? `Part ${item.part.number} of ${item.part.of}` : null,
  }
  switch (item.kind) {
    case 'learn':
      return {
        ...common,
        reason: item.note === 'On past exams' ? 'This topic is on your past exams.' : 'Read the notes, then work through the examples.',
        verb: item.note === 'You have started this one' ? 'Continue' : 'Start',
      }
    case 'quiz':
      return { ...common, reason: 'A quiz the day after learning is what makes it stick.', verb: 'Take quiz' }
    case 'review':
      return {
        ...common,
        reason: item.note ?? 'Due for review.',
        verb: 'Review',
      }
    case 'unit_mock':
      return { ...common, reason: 'Timed questions on the whole unit, now that you have learned it.', verb: 'Create' }
    case 'full_mock':
      return {
        ...common,
        reason: item.note ?? 'Timed, mixed-topic practice on the whole course.',
        verb: item.done ? 'View' : 'Create',
      }
  }
}

/** "Wednesday, Oct 21" style labels need the browser's locale; this gives a stable weekday name for tests and the server. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** "Wed, Oct 21" for a YYYY-MM-DD day; no time zone is involved (the day is already local). */
export function dayLabel(day: string, options: { long?: boolean } = {}): string {
  const [year, month, date] = day.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]
  return `${options.long ? weekday : weekday.slice(0, 3)}, ${MONTHS[month - 1]} ${date}`
}

/** "Oct 19 to Oct 25" for a week starting on `start`. */
export function weekLabel(start: string): string {
  const [year, month, date] = start.split('-').map(Number)
  const end = new Date(Date.UTC(year, month - 1, date + 6))
  const first = `${MONTHS[month - 1]} ${date}`
  const last = `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`
  return `${first} to ${last}`
}

/** What the overview's "Up next" card shows from today's items of the plan. */
export type UpNextData = {
  /** Items still to do today, in order. */
  upNext: DescribedPlanItem[]
  /** Items finished today. */
  doneToday: DescribedPlanItem[]
  /** Nothing is left for today: the first thing on the next day with work, if any. */
  later: { date: string; item: DescribedPlanItem } | null
}

export function upNextFromPlan(plan: Plan, courseId: string): UpNextData {
  const today = plan.days.find((day) => day.isToday)
  const described = (today?.items ?? []).map((item) => describePlanItem(item, courseId))
  const upNext = described.filter((item) => !item.done)
  const next = upNext.length === 0 ? plan.days.find((day) => !day.isToday && day.items.some((item) => !item.done)) : null
  const first = next?.items.find((item) => !item.done)
  return {
    upNext,
    doneToday: described.filter((item) => item.done),
    later: next && first ? { date: next.date, item: describePlanItem(first, courseId) } : null,
  }
}
