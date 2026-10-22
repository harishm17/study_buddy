import { addDays, localDay } from '@/lib/learning/plan'
import { dueBoundary, daysOverdue } from '@/lib/learning/next-step'
import { countMissedByTopic } from '@/lib/learning/review-server'
import { zonedTimeToUtc } from '@/lib/learning/study-plan-time'
import { getCourseShell } from '@/server/queries/courses'

export type ReviewTopic = {
  id: string
  name: string
  /** Mastery as shown: faded when the review is late. */
  mastery: number | null
  /** Mastery as earned, before it faded; the same as `mastery` when the review is not late. */
  earnedMastery: number | null
  dueAt: string
  /** Questions missed in the last two attempts ("Retry what you missed" is offered above zero). */
  missedCount: number
  /** Whole days the review is late in the student's zone; 0 when it is due today. */
  daysLate: number
}

export type ReviewPageData = {
  course: { id: string; name: string }
  /** Due by the end of today in the student's time zone, most overdue first. */
  due: ReviewTopic[]
  /** Coming up in the next two weeks. */
  upcoming: Omit<ReviewTopic, 'missedCount' | 'daysLate'>[]
  hasTopics: boolean
}

const UPCOMING_DAYS = 14
const UPCOMING_LIMIT = 8

/** Topics due for review now, with what the two review actions have to work with. Null if the course is not theirs. */
export async function getReviewPageData(
  userId: string,
  courseId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<ReviewPageData | null> {
  const course = await getCourseShell(userId, courseId)
  if (!course) return null

  const today = localDay(now, timeZone)
  const endOfToday = dueBoundary(now, timeZone).getTime()
  const [uYear, uMonth, uDay] = addDays(today, UPCOMING_DAYS + 1).split('-').map(Number)
  const upcomingEnd = zonedTimeToUtc({ year: uYear, month: uMonth, day: uDay }, 0, 0, timeZone).getTime()

  const scheduled = course.topics
    .filter((topic) => topic.confirmed && topic.dueAt)
    .map((topic) => ({ id: topic.id, name: topic.name, mastery: topic.mastery, earnedMastery: topic.earnedMastery, dueAt: topic.dueAt as string }))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))

  const dueTopics = scheduled.filter((topic) => Date.parse(topic.dueAt) < endOfToday)
  const missed = await countMissedByTopic(userId, dueTopics.map((topic) => topic.id))

  return {
    course: { id: course.id, name: course.name },
    due: dueTopics.map((topic) => ({
      ...topic,
      missedCount: missed.get(topic.id) ?? 0,
      daysLate: daysOverdue(topic.dueAt, now, timeZone),
    })),
    upcoming: scheduled
      .filter((topic) => Date.parse(topic.dueAt) >= endOfToday && Date.parse(topic.dueAt) < upcomingEnd)
      .slice(0, UPCOMING_LIMIT),
    hasTopics: course.topics.some((topic) => topic.confirmed),
  }
}
