import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

export type MasteryComponents = {
  quiz: number
  voice: number
  exam: number
  recencyPenalty: number
  mastery: number
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

const avg = (values: number[]) => {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function computeMasteryFromSignals(input: {
  quizScores: number[]
  voiceScores: number[]
  examScores: number[]
  daysSinceLastPractice: number
}): MasteryComponents {
  const quiz = clamp(avg(input.quizScores) / 100)
  const voice = clamp(avg(input.voiceScores))
  const exam = clamp(avg(input.examScores))
  const recencyPenalty = clamp((Math.min(input.daysSinceLastPractice, 14) / 14) * 0.25, 0, 0.25)
  const mastery = clamp(0.55 * quiz + 0.25 * voice + 0.2 * exam - recencyPenalty)

  return { quiz, voice, exam, recencyPenalty, mastery }
}

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
      select: { score: true, createdAt: true },
    }),
  ])

  const latestDates: Date[] = []
  if (quizAttempts[0]?.takenAt) latestDates.push(quizAttempts[0].takenAt)
  if (voiceAttempts[0]?.createdAt) latestDates.push(voiceAttempts[0].createdAt)
  if (examSignals[0]?.createdAt) latestDates.push(examSignals[0].createdAt)

  const daysSinceLastPractice = latestDates.length > 0
    ? (Date.now() - Math.max(...latestDates.map((d) => d.getTime()))) / (1000 * 60 * 60 * 24)
    : 30

  return computeMasteryFromSignals({
    quizScores: quizAttempts.map((attempt) => attempt.score),
    voiceScores: voiceAttempts.map((attempt) => attempt.score),
    examScores: examSignals.map((signal) => signal.score),
    daysSinceLastPractice,
  })
}

export function intervalFromMastery(
  mastery: number,
  options: { wasCorrect?: boolean; confidence?: number } = {}
) {
  const { wasCorrect = true, confidence } = options
  if (!wasCorrect) return 1

  let interval = 1
  if (mastery >= 0.8) interval = 14
  else if (mastery >= 0.6) interval = 7
  else if (mastery >= 0.4) interval = 3

  if (confidence !== undefined && confidence >= 4 && wasCorrect) {
    if (interval === 1) interval = 3
    else if (interval === 3) interval = 7
    else if (interval === 7) interval = 14
  }

  return interval
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
