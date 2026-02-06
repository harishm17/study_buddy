/**
 * API route for regenerating content (creates fresh variations)
 * POST /api/topics/[topicId]/regenerate-content
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

const regenerateContentSchema = z.object({
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
    variation_seed: z.number().optional(), // Used to ensure different content each time
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
    const validation = regenerateContentSchema.safeParse(body)

    if (!validation.success) {
      return apiInvalidInput('Invalid input', zodDetails(validation.error))
    }

    const { contentType, preferences } = validation.data
    const idempotencyKey = `${topicId}:${contentType}:regen:${stableStringify(preferences || {})}`
    const staleBefore = new Date(Date.now() - STALE_JOB_WINDOW_MS)
    const pendingDispatchBefore = new Date(Date.now() - PENDING_DISPATCH_STALE_MS)

    // Auto-close stale in-flight jobs so regeneration is never blocked forever.
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

    // Check for existing pending/processing regeneration jobs for same topic + content type
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
      return NextResponse.json({
        jobId: existingJob.id,
        status: existingJob.status === 'processing' ? 'processing' : 'queued',
        message: 'Content regeneration already in progress',
        estimatedSeconds: 60,
      })
    }

    // Add timestamp as variation seed to ensure different content each time
    const enhancedPreferences = {
      ...(preferences || {}),
      variation_seed: Date.now(),
      regeneration: true,
    }

    // Create processing job for regeneration
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
          preferences: enhancedPreferences,
          idempotencyKey,
        },
        progressPercent: 0,
      },
    })

    // Enqueue content generation task
    try {
      await enqueueContentGenerationJob(job.id, topicId, contentType, enhancedPreferences)
    } catch (enqueueError) {
      const retryable = enqueueError instanceof TaskEnqueueError
        ? enqueueError.retryable
        : true
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorCode: retryable ? 'ENQUEUE_FAILED' : 'ENQUEUE_PERMANENT',
          errorMessage: 'Failed to enqueue content regeneration job',
          retryable,
          completedAt: new Date(),
        },
      })
      return apiUpstream('Failed to start content regeneration')
    }

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      message: 'Content regeneration started',
      estimatedSeconds: 60,
    })
  } catch (error) {
    console.error('Content regeneration error:', error)

    if (isUnauthorizedError(error)) {
      return apiUnauthorized()
    }

    return apiInternal('Failed to start content regeneration')
  }
}
