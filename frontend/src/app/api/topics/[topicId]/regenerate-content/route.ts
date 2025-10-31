/**
 * API route for regenerating content (creates fresh variations)
 * POST /api/topics/[topicId]/regenerate-content
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { enqueueContentGenerationJob } from '@/lib/tasks/cloud-tasks'
import { z } from 'zod'

const regenerateContentSchema = z.object({
  contentType: z.enum(['section_notes', 'solved_examples', 'interactive_examples', 'topic_quiz']),
  preferences: z.object({
    detail_level: z.enum(['brief', 'moderate', 'comprehensive']).optional(),
    include_examples: z.boolean().optional(),
    count: z.number().min(1).max(10).optional(),
    question_count: z.number().min(5).max(30).optional(),
    difficulty_level: z.enum(['easy', 'medium', 'hard']).optional(),
    variation_seed: z.number().optional(), // Used to ensure different content each time
  }).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { topicId: string } }
) {
  try {
    const session = await requireAuth()
    const { topicId } = params

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
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validation = regenerateContentSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error },
        { status: 400 }
      )
    }

    const { contentType, preferences } = validation.data

    // Add timestamp as variation seed to ensure different content each time
    const enhancedPreferences = {
      ...(preferences || {}),
      variation_seed: Date.now(),
      regeneration: true,
    }

    // Delete existing content of this type (will be replaced)
    await prisma.topicContent.deleteMany({
      where: {
        topicId,
        contentType,
      },
    })

    // Create processing job for regeneration
    const job = await prisma.processingJob.create({
      data: {
        userId: session.user.id,
        projectId: topic.projectId,
        jobType: 'generate_content',
        status: 'pending',
        inputData: {
          topicId,
          contentType,
          preferences: enhancedPreferences,
        },
        progressPercent: 0,
      },
    })

    // Enqueue content generation task
    await enqueueContentGenerationJob(job.id, topicId, contentType, enhancedPreferences)

    return NextResponse.json({
      jobId: job.id,
      message: 'Content regeneration started',
    })
  } catch (error) {
    console.error('Content regeneration error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to start content regeneration' },
      { status: 500 }
    )
  }
}
