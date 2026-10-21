import { prisma } from '@/lib/db/prisma'
import { rankWeakestTopics, SPRINT_TOPIC_COUNT } from './voice-rank'

export { describeSprintTopics } from './voice-rank'

export type SprintTopic = { id: string; name: string }

/**
 * The topics a voice sprint on this course covers, weakest first. The same selection the
 * backend makes when the session is created (see voice-rank.ts). Filtered by the user id, so a
 * course that is not theirs gives an empty list. No orderBy on purpose: the backend reads the
 * topics without one, and ties keep that order.
 */
export async function getSprintTopics(userId: string, courseId: string): Promise<SprintTopic[]> {
  const topics = await prisma.topic.findMany({
    where: { projectId: courseId, project: { userId } },
    select: {
      id: true,
      name: true,
      progress: {
        where: { userId },
        take: 1,
        select: { quizScore: true, quizCompleted: true, notesCompleted: true, examplesCompleted: true },
      },
    },
  })

  return rankWeakestTopics(
    topics.map((topic) => ({ id: topic.id, name: topic.name, progress: topic.progress[0] ?? null })),
    SPRINT_TOPIC_COUNT
  ).map(({ id, name }) => ({ id, name }))
}
