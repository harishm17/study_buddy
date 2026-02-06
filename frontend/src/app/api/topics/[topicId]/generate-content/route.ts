/**
 * API route for content generation
 * POST /api/topics/[topicId]/generate-content
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { enqueueContentGenerationJob, TaskEnqueueError } from '@/lib/tasks/cloud-tasks'
import { z } from 'zod'
import { stableStringify } from '@/lib/utils/stable-json'
import {
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  apiUpstream,
  isUnauthorizedError,
  zodDetails,
} from '@/lib/api/errors'
import { ensureAiGenerationReady } from '@/lib/api/ai-preflight'

const STALE_JOB_WINDOW_MS = 6 * 60 * 1000
const PENDING_DISPATCH_STALE_MS = 90 * 1000

const generateContentSchema = z.object({
  contentType: z.enum(['section_notes', 'solved_examples', 'interactive_examples', 'topic_quiz']),
  preferences: z.object({
    detail_level: z.enum(['brief', 'moderate', 'comprehensive']).optional(),
    include_examples: z.boolean().optional(),
    count: z.number().min(1).max(10).optional(),
    question_count: z.number().min(5).max(30).optional(),
    difficulty_level: z.enum(['easy', 'medium', 'hard']).optional(),
    focus: z.string().trim().min(3).max(280).optional(),
    question_types: z.array(z.enum(['multiple_choice', 'short_answer', 'numerical', 'true_false'])).optional(),
    append: z.boolean().optional(),
  }).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    const session = await requireAuth()
    const { topicId } = await params

    // Verify topic ownership through project
    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        project: {
          userId: session.user.id,
        },
      },
      include: {
        project: true,
      },
    })

    if (!topic) {
      return apiNotFound('Topic not found')
    }

    const preflightError = await ensureAiGenerationReady()
    if (preflightError) {
      return preflightError
    }

    const body = await request.json()
    const validation = generateContentSchema.safeParse(body)

    if (!validation.success) {
      return apiInvalidInput('Invalid input', zodDetails(validation.error))
    }

    const { contentType, preferences } = validation.data
    const idempotencyKey = `${topicId}:${contentType}:${stableStringify(preferences || {})}`
    const staleBefore = new Date(Date.now() - STALE_JOB_WINDOW_MS)
    const pendingDispatchBefore = new Date(Date.now() - PENDING_DISPATCH_STALE_MS)

    // Check if content already exists for this type
    const existingContent = await prisma.topicContent.findFirst({
      where: {
        topicId,
        contentType,
      },
    })

    // Auto-close stale in-flight jobs so new attempts are never blocked forever.
    await prisma.processingJob.updateMany({
      where: {
        projectId: topic.projectId,
        jobType: 'generate_content',
        status: {
          in: ['pending', 'processing'],
        },
        OR: [
          {
            createdAt: {
              lt: staleBefore,
            },
          },
          {
            status: 'pending',
            startedAt: null,
            createdAt: {
              lt: pendingDispatchBefore,
            },
          },
        ],
        AND: [
          {
            inputData: {
              path: ['topicId'],
              equals: topicId,
            },
          },
          {
            inputData: {
              path: ['contentType'],
              equals: contentType,
            },
          },
          {
            inputData: {
              path: ['idempotencyKey'],
              equals: idempotencyKey,
            },
          },
        ],
      },
      data: {
        status: 'failed',
        errorCode: 'STALE_JOB',
        errorMessage: 'Automatically closed stale in-flight job. Please retry.',
        retryable: true,
        completedAt: new Date(),
      },
    })

    // Check for existing pending/processing jobs for the same topic + contentType
    const existingJob = await prisma.processingJob.findFirst({
      where: {
        projectId: topic.projectId,
        jobType: 'generate_content',
        status: {
          in: ['pending', 'processing'],
        },
        AND: [
          {
            inputData: {
              path: ['topicId'],
              equals: topicId,
            },
          },
          {
            inputData: {
              path: ['contentType'],
              equals: contentType,
            },
          },
          {
            inputData: {
              path: ['idempotencyKey'],
              equals: idempotencyKey,
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    if (existingJob) {
      // Job already in progress, return existing job ID
      return NextResponse.json({
        jobId: existingJob.id,
        status: existingJob.status === 'processing' ? 'processing' : 'queued',
        message: 'Content generation already in progress',
        estimatedSeconds: 60,
        replacingExisting: !!existingContent,
      })
    }

    // Create processing job
    const job = await prisma.processingJob.create({
      data: {
        userId: session.user.id,
        projectId: topic.projectId,
        jobType: 'generate_content',
        status: 'pending',
        stage: 'generating',
        inputData: {
          topicId,
          contentType,
          preferences: preferences || {},
          idempotencyKey,
        },
        progressPercent: 0,
      },
    })

    // Enqueue content generation task
    try {
      await enqueueContentGenerationJob(job.id, topicId, contentType, preferences || {})
    } catch (enqueueError) {
      const retryable = enqueueError instanceof TaskEnqueueError
        ? enqueueError.retryable
        : true
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorCode: retryable ? 'ENQUEUE_FAILED' : 'ENQUEUE_PERMANENT',
          errorMessage: 'Failed to enqueue content generation job',
          retryable,
          completedAt: new Date(),
        },
      })
      return apiUpstream('Failed to start content generation')
    }

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      message: 'Content generation started',
      estimatedSeconds: 60,
      replacingExisting: !!existingContent,
    })
  } catch (error) {
    console.error('Content generation error:', error)

    if (isUnauthorizedError(error)) {
      return apiUnauthorized()
    }

    return apiInternal('Failed to start content generation')
  }
}
