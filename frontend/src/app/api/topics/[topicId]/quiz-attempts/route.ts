/**
 * API route for quiz attempts
 * POST /api/topics/[topicId]/quiz-attempts - Save quiz attempt
 * GET /api/topics/[topicId]/quiz-attempts - Get quiz history
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { z } from 'zod'

const saveQuizAttemptSchema = z.object({
  answers: z.record(z.string()), // { questionIndex: answer }
  results: z.record(z.boolean()), // { questionIndex: isCorrect }
  score: z.number().min(0).max(100),
})

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

    // Save quiz attempt
    const attempt = await prisma.quizAttempt.create({
      data: {
        userId: session.user.id,
        topicId,
        answers: validation.data.answers,
        results: validation.data.results,
        score: validation.data.score,
      },
    })

    // Update topic progress with best score
    const existingProgress = await prisma.topicProgress.findUnique({
      where: {
        topicId_userId: {
          topicId,
          userId: session.user.id,
        },
      },
    })

    const bestScore = existingProgress?.quizScore
      ? Math.max(existingProgress.quizScore, validation.data.score)
      : validation.data.score

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

    // Fetch quiz attempts (most recent first)
    const attempts = await prisma.quizAttempt.findMany({
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
    })

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
