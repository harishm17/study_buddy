import { prisma } from '@/lib/db/prisma'
import { computeTopicMastery, upsertReviewSchedule } from './mastery'

/** An exam is "right" for a topic, for scheduling the next review, at this share of its points. */
export const EXAM_PASS_SHARE = 0.7

/**
 * Per-topic scores of one graded submission, from the exam learning signals the grading job stored
 * (one per question, with the topic of the question). Topic id to the mean of its questions.
 */
export function scoresByTopic(signals: { topicId: string | null; score: number }[]): Map<string, number> {
  const totals = new Map<string, { sum: number; count: number }>()
  for (const signal of signals) {
    if (!signal.topicId) continue
    const entry = totals.get(signal.topicId) ?? { sum: 0, count: 0 }
    entry.sum += signal.score
    entry.count += 1
    totals.set(signal.topicId, entry)
  }
  return new Map([...totals].map(([topicId, { sum, count }]) => [topicId, sum / count]))
}

/**
 * Applies one graded exam submission to the student's mastery and review schedules: for every topic
 * the exam asked about, mastery is recomputed (the exam signals are already stored) and the topic's
 * review is rescheduled, like a quiz attempt.
 *
 * It runs at most once per grading. `reviewAppliedAt` is claimed first with a conditional update, so two
 * pages or tabs that open the results together apply it once; the grading job clears the mark when a
 * regrade replaces the result, so the new grading is applied in turn. A failure puts the mark back so
 * the next visit tries again. Returns whether this call applied it.
 */
export async function applyGradedExam(userId: string, projectId: string, submissionId: string): Promise<boolean> {
  const claim = await prisma.examSubmission.updateMany({
    where: { id: submissionId, userId, status: 'submitted', gradedAt: { not: null }, reviewAppliedAt: null },
    data: { reviewAppliedAt: new Date() },
  })
  if (claim.count === 0) return false

  try {
    const signals = await prisma.learningSignal.findMany({
      where: {
        userId,
        projectId,
        source: 'exam',
        topicId: { not: null },
        metadata: { path: ['submission_id'], equals: submissionId },
      },
      select: { topicId: true, score: true },
    })
    const scores = scoresByTopic(signals)
    if (scores.size === 0) return true
    const existing = await prisma.topic.findMany({
      where: { id: { in: [...scores.keys()] }, projectId },
      select: { id: true },
    })
    for (const { id: topicId } of existing) {
      const mastery = await computeTopicMastery(userId, projectId, topicId)
      await upsertReviewSchedule({
        userId,
        projectId,
        topicId,
        mastery: mastery.mastery,
        wasCorrect: (scores.get(topicId) ?? 0) >= EXAM_PASS_SHARE,
      })
    }
    return true
  } catch (error) {
    await prisma.examSubmission
      .updateMany({ where: { id: submissionId, userId }, data: { reviewAppliedAt: null } })
      .catch(() => undefined)
    throw error
  }
}

/** Applies every graded submission of a course that has not been applied yet (a few at a time). */
export async function applyPendingExamResults(userId: string, projectId: string): Promise<number> {
  const pending = await prisma.examSubmission.findMany({
    where: {
      userId,
      status: 'submitted',
      gradedAt: { not: null },
      reviewAppliedAt: null,
      sampleExam: { projectId, project: { userId } },
    },
    orderBy: { gradedAt: 'asc' },
    take: 10,
    select: { id: true },
  })
  let applied = 0
  for (const { id } of pending) {
    try {
      if (await applyGradedExam(userId, projectId, id)) applied += 1
    } catch (error) {
      console.error('Applying a graded exam to mastery failed:', error)
    }
  }
  return applied
}
