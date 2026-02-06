import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import {
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
  zodDetails,
} from '@/lib/api/errors'
import {
  computeTopicMastery,
  recordLearningSignal,
  upsertReviewSchedule,
} from '@/lib/learning/mastery'

const confidenceSchema = z.object({
  source: z.enum(['quiz', 'voice', 'exam']),
  value: z.number().int().min(1).max(5),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    const auth = await requireAuth()
    const { topicId } = await params
    const body = await request.json()
    const parsed = confidenceSchema.safeParse(body)
    if (!parsed.success) {
      return apiInvalidInput('Invalid input', zodDetails(parsed.error))
    }

    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        project: { userId: auth.user.id },
      },
      select: {
        id: true,
        projectId: true,
      },
    })

    if (!topic) {
      return apiNotFound('Topic not found')
    }

    let score = 0
    if (parsed.data.source === 'quiz') {
      const latest = await prisma.quizAttempt.findFirst({
        where: {
          userId: auth.user.id,
          topicId,
        },
        orderBy: { takenAt: 'desc' },
        select: { score: true },
      })
      score = latest ? latest.score / 100 : 0
    } else if (parsed.data.source === 'voice') {
      const latest = await prisma.voiceDrillAttempt.findFirst({
        where: {
          userId: auth.user.id,
          topicId,
        },
        orderBy: { createdAt: 'desc' },
        select: { score: true },
      })
      score = latest?.score || 0
    } else {
      const latest = await prisma.learningSignal.findFirst({
        where: {
          userId: auth.user.id,
          projectId: topic.projectId,
          topicId,
          source: 'exam',
        },
        orderBy: { createdAt: 'desc' },
        select: { score: true },
      })
      score = latest?.score || 0
    }

    await recordLearningSignal({
      userId: auth.user.id,
      projectId: topic.projectId,
      topicId: topic.id,
      source: parsed.data.source,
      score,
      confidence: parsed.data.value,
      metadata: { kind: 'confidence_feedback' },
    })

    const mastery = await computeTopicMastery(auth.user.id, topic.projectId, topic.id)
    const schedule = await upsertReviewSchedule({
      userId: auth.user.id,
      projectId: topic.projectId,
      topicId: topic.id,
      mastery: mastery.mastery,
      wasCorrect: score >= 0.6,
      confidence: parsed.data.value,
    })

    return NextResponse.json({
      success: true,
      confidence: parsed.data.value,
      mastery: mastery.mastery,
      nextReviewAt: schedule.dueAt,
    })
  } catch (error) {
    console.error('Confidence save error:', error)
    if (isUnauthorizedError(error)) {
      return apiUnauthorized()
    }
    return apiInternal('Failed to save confidence')
  }
}
