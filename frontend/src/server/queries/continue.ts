import { prisma } from '@/lib/db/prisma'
import { buildNextActionsForProject } from '@/lib/learning/planner'
import { describeNextAction, type DescribedAction } from '@/lib/next-action'

export type ContinueAction = {
  course: { id: string; name: string }
  action: DescribedAction
}

/**
 * The top "Up next" action of the most recently updated course, using the same planner as
 * GET /api/projects/[id]/next-actions. Null when the user has no courses.
 */
export async function continueAction(userId: string): Promise<ContinueAction | null> {
  const course = await prisma.project.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true },
  })
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
