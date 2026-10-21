import { prisma } from '@/lib/db/prisma'
import { displayMastery } from '@/lib/learning/mastery-math'

export type DueReview = {
  topicId: string
  topicName: string
  courseId: string
  courseName: string
  dueAt: string
  mastery: number
}

/**
 * Topics across the user's courses whose review is due by the end of today (UTC), most overdue
 * first. `total` counts all of them so the UI can say "and N more".
 */
export async function dueReviews(userId: string, limit = 5): Promise<{ items: DueReview[]; total: number }> {
  const endOfToday = new Date()
  endOfToday.setUTCHours(23, 59, 59, 999)
  const where = { userId, dueAt: { lte: endOfToday }, project: { userId }, topic: { userConfirmed: true } }

  const [rows, total] = await Promise.all([
    prisma.reviewSchedule.findMany({
      where,
      orderBy: { dueAt: 'asc' },
      take: limit,
      select: {
        topicId: true,
        dueAt: true,
        mastery: true,
        intervalDays: true,
        topic: { select: { name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.reviewSchedule.count({ where }),
  ])

  const now = Date.now()
  return {
    total,
    items: rows.map((row) => ({
      topicId: row.topicId,
      topicName: row.topic.name,
      courseId: row.project.id,
      courseName: row.project.name,
      dueAt: row.dueAt.toISOString(),
      mastery: displayMastery(row.mastery, row, now) ?? row.mastery,
    })),
  }
}
