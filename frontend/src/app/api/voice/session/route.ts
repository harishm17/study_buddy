import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { VoiceQuestion } from '@/lib/voice/concept'
import { buildSprintQuestionSet, buildTopicQuestionSet } from '@/lib/voice/drill-pack'
import {
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
  zodDetails,
} from '@/lib/api/errors'

const sessionSchema = z.object({
  mode: z.enum(['topic_drill', 'sprint']).default('topic_drill'),
  style: z.enum(['oral_quiz', 'guided_notes', 'topic_conversation']).optional().default('oral_quiz'),
  projectId: z.string(),
  topicId: z.string().optional(),
  language: z.string().regex(/^[a-z]{2,8}$/i).optional().default('en'),
  voice: z.string().optional().default('marin'),
})

const patchSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['active', 'ended', 'aborted']).optional(),
  lastDetectedLanguage: z.string().regex(/^[a-z]{2,8}$/i).nullable().optional(),
  incrementInterruptCount: z.number().int().min(0).max(20).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const payload = sessionSchema.parse(body)

    if (payload.mode === 'topic_drill' && !payload.topicId) {
      return apiInvalidInput('topicId is required for topic drills')
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: payload.projectId,
        userId: session.user.id,
      },
    })

    if (!project) {
      return apiNotFound('Project not found')
    }

    if (payload.mode === 'topic_drill' && payload.topicId) {
      const topic = await prisma.topic.findFirst({
        where: {
          id: payload.topicId,
          projectId: payload.projectId,
          project: { userId: session.user.id },
        },
        select: { id: true },
      })

      if (!topic) {
        return apiNotFound('Topic not found')
      }
    }

    let questionSet: VoiceQuestion[] = []

    if (payload.mode === 'topic_drill' && payload.topicId) {
      questionSet = await buildTopicQuestionSet(payload.topicId, session.user.id)
    } else {
      questionSet = await buildSprintQuestionSet(payload.projectId, session.user.id)
    }

    const requiresQuestionSet = payload.mode === 'sprint' || payload.style === 'oral_quiz'
    if (requiresQuestionSet && questionSet.length === 0) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'No conceptual questions available' }, requiresGeneration: true },
        { status: 422 }
      )
    }

    const voiceSession = await prisma.voiceDrillSession.create({
      data: {
        userId: session.user.id,
        projectId: payload.projectId,
        topicId: payload.topicId ?? null,
        mode: payload.mode,
        language: payload.language || 'en',
        voice: payload.voice || 'marin',
        questionSet,
        metrics: { entries: [] },
        status: 'active',
      },
    })

    return NextResponse.json({
      sessionId: voiceSession.id,
      questionCount: questionSet.length,
      mode: payload.mode,
    })
  } catch (error) {
    console.error('Create voice session error:', error)

    if (error instanceof z.ZodError) {
      return apiInvalidInput('Invalid input', zodDetails(error))
    }

    if (isUnauthorizedError(error)) {
      return apiUnauthorized()
    }

    return apiInternal('Failed to create voice session')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth()
    const body = await request.json()
    const payload = patchSchema.parse(body)

    const session = await prisma.voiceDrillSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: auth.user.id,
      },
      select: {
        id: true,
        interruptCount: true,
      },
    })

    if (!session) {
      return apiNotFound('Session not found')
    }

    const nextInterruptCount = payload.incrementInterruptCount
      ? session.interruptCount + payload.incrementInterruptCount
      : session.interruptCount

    const updated = await prisma.voiceDrillSession.update({
      where: { id: payload.sessionId },
      data: {
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.lastDetectedLanguage !== undefined
          ? { lastDetectedLanguage: payload.lastDetectedLanguage }
          : {}),
        ...(payload.status === 'ended' || payload.status === 'aborted'
          ? { endedAt: new Date() }
          : {}),
        ...(payload.incrementInterruptCount
          ? { interruptCount: nextInterruptCount }
          : {}),
      },
      select: {
        id: true,
        status: true,
        interruptCount: true,
        lastDetectedLanguage: true,
        endedAt: true,
      },
    })

    return NextResponse.json({ session: updated })
  } catch (error) {
    console.error('Patch voice session error:', error)

    if (error instanceof z.ZodError) {
      return apiInvalidInput('Invalid input', zodDetails(error))
    }
    if (isUnauthorizedError(error)) {
      return apiUnauthorized()
    }
    return apiInternal('Failed to update voice session')
  }
}
