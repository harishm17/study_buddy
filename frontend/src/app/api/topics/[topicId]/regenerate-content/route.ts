/**
 * API route for regenerating content (creates fresh variations)
 * POST /api/topics/[topicId]/regenerate-content
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { enqueueContentGenerationJob, TaskEnqueueError } from '@/lib/tasks/cloud-tasks'
import { z } from 'zod'
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
import {
  closeUndispatchedJobs,
  createJobOrFindActive,
  generateContentTarget,
} from '@/lib/jobs/active-jobs'

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
    // One generation per topic and content type at a time (a unique target key), so a
    // double click or a second tab gets the job that is already running.
    const targetKey = generateContentTarget(topicId, contentType)
    await closeUndispatchedJobs({ targetKey })

    // Add timestamp as variation seed to ensure different content each time
    const enhancedPreferences = {
      ...(preferences || {}),
      variation_seed: Date.now(),
      regeneration: true,
    }

    const { job, created } = await createJobOrFindActive({
      userId: session.user.id,
      projectId: topic.projectId,
      jobType: 'generate_content',
      status: 'pending',
      stage: 'generating',
      inputData: {
        topicId,
        contentType,
        preferences: enhancedPreferences,
      },
      progressPercent: 0,
      targetKey,
    })

    if (!created) {
      return NextResponse.json({
        jobId: job.id,
        status: job.status === 'processing' ? 'processing' : 'queued',
        message: 'Content regeneration already in progress',
        estimatedSeconds: 60,
      })
    }

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
