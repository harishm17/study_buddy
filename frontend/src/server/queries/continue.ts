import { prisma } from '@/lib/db/prisma'
import { upNextFromPlan } from '@/lib/learning/plan-copy'
import { mostRecentActivity } from '@/features/home/recent-course'
import { getPlanData } from './plan'

export type ContinueAction = {
  course: { id: string; name: string }
  action: { title: string; reason: string; etaLabel: string; href: string }
}

/**
 * The course the student studied most recently: the latest of a topic last opened, a quiz
 * taken or a learning signal, across their courses. Falls back to the most recently updated
 * course when they have not studied anything yet.
 */
async function continueCourse(userId: string): Promise<{ id: string; name: string } | null> {
  const [progress, attempt, signal] = await Promise.all([
    prisma.topicProgress.findFirst({
      where: { userId, lastAccessedAt: { not: null }, topic: { project: { userId } } },
      orderBy: { lastAccessedAt: 'desc' },
      select: { lastAccessedAt: true, topic: { select: { projectId: true } } },
    }),
    prisma.quizAttempt.findFirst({
      where: { userId, topic: { project: { userId } } },
      orderBy: { takenAt: 'desc' },
      select: { takenAt: true, topic: { select: { projectId: true } } },
    }),
    prisma.learningSignal.findFirst({
      where: { userId, project: { userId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, projectId: true },
    }),
  ])

  const recentId = mostRecentActivity([
    { courseId: progress?.topic.projectId ?? '', at: progress?.lastAccessedAt },
    { courseId: attempt?.topic.projectId ?? '', at: attempt?.takenAt },
    { courseId: signal?.projectId ?? '', at: signal?.createdAt },
  ])

  if (recentId) {
    const course = await prisma.project.findFirst({ where: { id: recentId, userId }, select: { id: true, name: true } })
    if (course) return course
  }
  return prisma.project.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true },
  })
}

/**
 * The first thing to do today in the plan of the course the student worked on most recently (or the
 * first thing on the next day with work when today is done). Null when the user has no courses or
 * nothing is planned.
 */
export async function continueAction(userId: string, timeZone: string): Promise<ContinueAction | null> {
  const course = await continueCourse(userId)
  if (!course) return null

  const data = await getPlanData(userId, course.id, timeZone)
  if (!data) return null
  if (data.course.setup.mode === 'setup') {
    return {
      course,
      action: {
        title: data.course.setup.label,
        reason: 'Finish setting up this course to get your study plan.',
        etaLabel: 'A few minutes',
        href: `/courses/${course.id}`,
      },
    }
  }
  const { upNext, later } = upNextFromPlan(data.plan, course.id)
  const first = upNext[0] ?? later?.item
  if (!first) return null
  return { course, action: { title: first.title, reason: first.reason, etaLabel: first.etaLabel, href: first.href } }
}
