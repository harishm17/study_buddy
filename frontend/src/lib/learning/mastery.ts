import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { computeMasteryFromSignals, intervalFromMastery, type MasteryComponents } from './mastery-math'

export { computeMasteryFromSignals, intervalFromMastery }
export type { MasteryComponents }

/** Signals an older confidence route wrote with a copy of a past score; they are not results. */
export const isConfidenceFeedback = (metadata: unknown) =>
  !!metadata &&
  typeof metadata === 'object' &&
  (metadata as Record<string, unknown>).kind === 'confidence_feedback'

export async function computeTopicMastery(
  userId: string,
  projectId: string,
  topicId: string
): Promise<MasteryComponents> {
  const [quizAttempts, voiceAttempts, examSignals] = await Promise.all([
    prisma.quizAttempt.findMany({
      where: { userId, topicId },
      orderBy: { takenAt: 'desc' },
      take: 5,
      select: { score: true, takenAt: true },
    }),
    prisma.voiceDrillAttempt.findMany({
      where: { userId, topicId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { score: true, createdAt: true },
    }),
    prisma.learningSignal.findMany({
      where: {
        userId,
        projectId,
        topicId,
        source: 'exam',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { score: true, createdAt: true, metadata: true },
    }),
  ])

  const examResults = examSignals.filter((signal) => !isConfidenceFeedback(signal.metadata))

  const latestDates: Date[] = []
  if (quizAttempts[0]?.takenAt) latestDates.push(quizAttempts[0].takenAt)
  if (voiceAttempts[0]?.createdAt) latestDates.push(voiceAttempts[0].createdAt)
  if (examResults[0]?.createdAt) latestDates.push(examResults[0].createdAt)

  const daysSinceLastPractice = latestDates.length > 0
    ? (Date.now() - Math.max(...latestDates.map((d) => d.getTime()))) / (1000 * 60 * 60 * 24)
    : 30

  return computeMasteryFromSignals({
    quizScores: quizAttempts.map((attempt) => attempt.score),
    voiceScores: voiceAttempts.map((attempt) => attempt.score),
    examScores: examResults.map((signal) => signal.score),
    daysSinceLastPractice,
  })
}

export async function upsertReviewSchedule(input: {
  userId: string
  projectId: string
  topicId: string
  mastery: number
  wasCorrect?: boolean
  confidence?: number
}) {
  const { userId, projectId, topicId, mastery, wasCorrect = true, confidence } = input
  const intervalDays = intervalFromMastery(mastery, { wasCorrect, confidence })
  const now = new Date()
  const dueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)

  const existing = await prisma.reviewSchedule.findUnique({
    where: {
      userId_topicId: {
        userId,
        topicId,
      },
    },
    select: {
      streak: true,
    },
  })

  return prisma.reviewSchedule.upsert({
    where: {
      userId_topicId: {
        userId,
        topicId,
      },
    },
    update: {
      projectId,
      mastery,
      dueAt,
      intervalDays,
      streak: wasCorrect ? (existing?.streak || 0) + 1 : 0,
      lastReviewedAt: now,
    },
    create: {
      userId,
      projectId,
      topicId,
      mastery,
      dueAt,
      intervalDays,
      streak: wasCorrect ? 1 : 0,
      lastReviewedAt: now,
    },
  })
}

/**
 * Re-time a topic's next review after the student rates their confidence.
 *
 * Confidence is feedback, not practice: it never touches the streak or the last-reviewed
 * time, and it does not create a schedule for a topic nobody has practised. Low confidence
 * (1-2) brings the review forward to tomorrow; otherwise the usual mastery-based interval
 * applies, one step longer when confidence is high.
 */
export async function adjustReviewForConfidence(input: {
  userId: string
  topicId: string
  mastery: number
  confidence: number
}) {
  const { userId, topicId, mastery, confidence } = input
  const existing = await prisma.reviewSchedule.findUnique({
    where: { userId_topicId: { userId, topicId } },
    select: { lastReviewedAt: true },
  })
  if (!existing) return null

  const intervalDays = confidence <= 2 ? 1 : intervalFromMastery(mastery, { confidence })
  const base = existing.lastReviewedAt ?? new Date()
  return prisma.reviewSchedule.update({
    where: { userId_topicId: { userId, topicId } },
    data: {
      mastery,
      intervalDays,
      dueAt: new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000),
    },
  })
}

export async function recordLearningSignal(input: {
  userId: string
  projectId: string
  topicId?: string | null
  source: 'quiz' | 'voice' | 'exam'
  score: number
  confidence?: number
  metadata?: Record<string, unknown>
}) {
  return prisma.learningSignal.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      topicId: input.topicId ?? null,
      source: input.source,
      score: input.score,
      confidence: input.confidence ?? null,
      metadata: (input.metadata ?? {}) as Prisma.JsonObject,
    },
  })
}
