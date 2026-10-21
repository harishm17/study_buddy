import { prisma } from '@/lib/db/prisma'
import { buildNextActionsForProject } from '@/lib/learning/planner'
import { describeNextAction, type DescribedAction } from '@/lib/next-action'
import { mostRecentActivity } from '@/features/home/recent-course'

export type ContinueAction = {
  course: { id: string; name: string }
  action: DescribedAction
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
 * The top "Up next" action of the course the student worked on most recently, using the same
 * planner as GET /api/projects/[id]/next-actions. Null when the user has no courses.
 */
export async function continueAction(userId: string): Promise<ContinueAction | null> {
  const course = await continueCourse(userId)
  if (!course) return null

  const [first] = await buildNextActionsForProject(userId, course.id)
  if (!first) return null

  const topic = first.topicId
    ? await prisma.topic.findFirst({
        where: { id: first.topicId, project: { userId } },
        select: { name: true },
      })
    : null

  return { course, action: describeNextAction(first, course.id, topic?.name) }
}
