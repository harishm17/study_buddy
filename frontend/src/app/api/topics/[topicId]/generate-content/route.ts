/**
 * API route for content generation
 * POST /api/topics/[topicId]/generate-content
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { enqueueContentGenerationJob } from '@/lib/tasks/cloud-tasks'
import { z } from 'zod'

const generateContentSchema = z.object({
  contentType: z.enum(['section_notes', 'solved_examples', 'interactive_examples', 'topic_quiz']),
  preferences: z.object({
    detail_level: z.enum(['brief', 'moderate', 'comprehensive']).optional(),
    include_examples: z.boolean().optional(),
    count: z.number().min(1).max(10).optional(),
    question_count: z.number().min(5).max(30).optional(),
    difficulty_level: z.enum(['easy', 'medium', 'hard']).optional(),
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
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validation = generateContentSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error },
        { status: 400 }
      )
    }

    const { contentType, preferences } = validation.data

    // Check if content already exists for this type
    const existingContent = await prisma.topicContent.findFirst({
      where: {
        topicId,
        contentType,
      },
    })

    // Check for existing pending/processing jobs to prevent duplicates (race condition)
    const existingJob = await prisma.processingJob.findFirst({
      where: {
        projectId: topic.projectId,
        jobType: 'generate_content',
        status: {
          in: ['pending', 'processing'],
        },
        inputData: {
          path: ['topicId'],
          equals: topicId,
        },
      },
    })

    if (existingJob) {
      // Job already in progress, return existing job ID
      return NextResponse.json({
        jobId: existingJob.id,
        message: 'Content generation already in progress',
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
        inputData: {
          topicId,
          contentType,
          preferences: preferences || {},
        },
        progressPercent: 0,
      },
    })

    // Enqueue content generation task
    await enqueueContentGenerationJob(job.id, topicId, contentType, preferences || {})

    return NextResponse.json({
      jobId: job.id,
      message: 'Content generation started',
      replacingExisting: !!existingContent,
    })
  } catch (error) {
    console.error('Content generation error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to start content generation' },
      { status: 500 }
    )
  }
}
