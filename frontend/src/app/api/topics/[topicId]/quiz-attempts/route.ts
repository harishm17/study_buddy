/**
 * API route for quiz attempts
 * POST /api/topics/[topicId]/quiz-attempts - Save quiz attempt
 * GET /api/topics/[topicId]/quiz-attempts - Get quiz history
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import {
  computeTopicMastery,
  recordLearningSignal,
  upsertReviewSchedule,
} from '@/lib/learning/mastery'

const saveQuizAttemptSchema = z.object({
  answers: z.record(z.string()), // { questionIndex: answer }
  results: z.record(z.boolean()), // { questionIndex: isCorrect }
  score: z.number().min(0).max(100),
  quizSetId: z.string().optional(),
})

function isMissingQuizSetColumnError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false
  }
  if (error.code !== 'P2022') {
    return false
  }

  const column = String(error.meta?.column || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()

  return (
    column.includes('quiz_set_id') ||
    column.includes('quizsetid') ||
    message.includes('quiz_set_id') ||
    message.includes('quizsetid')
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    const session = await requireAuth()
    const { topicId } = await params

    // Verify topic ownership
    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        project: {
          userId: session.user.id,
        },
      },
    })

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validation = saveQuizAttemptSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error },
        { status: 400 }
      )
    }

    // Save quiz attempt. Fallback keeps older DBs (without quiz_set_id) working.
    let attempt: Awaited<ReturnType<typeof prisma.quizAttempt.create>>
    try {
      attempt = await prisma.quizAttempt.create({
        data: {
          userId: session.user.id,
          topicId,
          quizSetId: validation.data.quizSetId || null,
          answers: validation.data.answers,
          results: validation.data.results,
          score: validation.data.score,
        },
      })
    } catch (createError) {
      if (!isMissingQuizSetColumnError(createError)) {
        throw createError
      }

      attempt = await prisma.quizAttempt.create({
        data: {
          userId: session.user.id,
          topicId,
          answers: validation.data.answers,
          results: validation.data.results,
          score: validation.data.score,
        },
      })
    }

    // Update topic progress with best score
    const existingProgress = await prisma.topicProgress.findUnique({
      where: {
        topicId_userId: {
          topicId,
          userId: session.user.id,
        },
      },
    })

    const currentBest = existingProgress?.quizScore
    const bestScore = currentBest === null || currentBest === undefined
      ? validation.data.score
      : Math.max(currentBest, validation.data.score)

    await prisma.topicProgress.upsert({
      where: {
        topicId_userId: {
          topicId,
          userId: session.user.id,
        },
      },
      update: {
        quizCompleted: true,
        quizScore: bestScore,
        lastAccessedAt: new Date(),
      },
      create: {
        topicId,
        userId: session.user.id,
        notesCompleted: false,
        examplesCompleted: false,
        quizCompleted: true,
        quizScore: validation.data.score,
        lastAccessedAt: new Date(),
      },
    })

    await recordLearningSignal({
      userId: session.user.id,
      projectId: topic.projectId,
      topicId,
      source: 'quiz',
      score: validation.data.score / 100,
      metadata: {
        attemptId: attempt.id,
        quizSetId: validation.data.quizSetId || null,
      },
    })

    const mastery = await computeTopicMastery(session.user.id, topic.projectId, topicId)
    await upsertReviewSchedule({
      userId: session.user.id,
      projectId: topic.projectId,
      topicId,
      mastery: mastery.mastery,
      wasCorrect: validation.data.score >= 70,
    })

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        score: attempt.score,
        takenAt: attempt.takenAt,
      },
      bestScore,
    })
  } catch (error) {
    console.error('Save quiz attempt error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to save quiz attempt' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    const session = await requireAuth()
    const { topicId } = await params
    const { searchParams } = new URL(request.url)
    const rawQuizSetId = searchParams.get('quizSetId')
    const quizSetFilter = rawQuizSetId
      ? rawQuizSetId === 'legacy'
        ? { quizSetId: null as null }
        : { quizSetId: rawQuizSetId }
      : {}

    // Verify topic ownership
    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        project: {
          userId: session.user.id,
        },
      },
    })

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      )
    }

    // Fetch quiz attempts (most recent first). Fallback keeps older DBs working.
    let attempts: Array<{
      id: string
      score: number
      takenAt: Date
      quizSetId: string | null
      answers: Prisma.JsonValue
      results: Prisma.JsonValue
    }>

    try {
      attempts = await prisma.quizAttempt.findMany({
        where: {
          topicId,
          userId: session.user.id,
          ...quizSetFilter,
        },
        orderBy: {
          takenAt: 'desc',
        },
        select: {
          id: true,
          score: true,
          takenAt: true,
          quizSetId: true,
          answers: true,
          results: true,
        },
      })
    } catch (fetchError) {
      if (!isMissingQuizSetColumnError(fetchError)) {
        throw fetchError
      }

      attempts = await prisma.quizAttempt.findMany({
        where: {
          topicId,
          userId: session.user.id,
        },
        orderBy: {
          takenAt: 'desc',
        },
        select: {
          id: true,
          score: true,
          takenAt: true,
          answers: true,
          results: true,
        },
      }).then((rows) =>
        rows.map((row) => ({
          ...row,
          quizSetId: null,
        }))
      )
    }

    // Calculate statistics
    const bestScore = attempts.length > 0
      ? Math.max(...attempts.map(a => a.score))
      : null

    const latestScore = attempts.length > 0 ? attempts[0].score : null

    const averageScore = attempts.length > 0
      ? attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length
      : null

    return NextResponse.json({
      attempts,
      stats: {
        totalAttempts: attempts.length,
        bestScore,
        latestScore,
        averageScore,
      },
    })
  } catch (error) {
    console.error('Fetch quiz attempts error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch quiz attempts' },
      { status: 500 }
    )
  }
}
