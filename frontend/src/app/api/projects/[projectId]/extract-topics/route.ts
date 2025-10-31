/**
 * API route for topic extraction
 * POST /api/projects/[projectId]/extract-topics
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { enqueueTopicExtractionJob } from '@/lib/tasks/cloud-tasks'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireAuth()
    const { projectId } = await params

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if project has valid materials
    const validMaterialsCount = await prisma.material.count({
      where: {
        projectId,
        validationStatus: 'valid',
      },
    })

    if (validMaterialsCount === 0) {
      return NextResponse.json(
        { error: 'No valid materials found. Please upload and validate materials first.' },
        { status: 400 }
      )
    }

    // Create processing job
    const job = await prisma.processingJob.create({
      data: {
        userId: session.user.id,
        projectId,
        jobType: 'extract_topics',
        status: 'pending',
        inputData: { projectId },
        progressPercent: 0,
      },
    })

    // Enqueue topic extraction task
    await enqueueTopicExtractionJob(job.id, projectId)

    return NextResponse.json({
      jobId: job.id,
      message: 'Topic extraction started',
    })
  } catch (error) {
    console.error('Topic extraction error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to start topic extraction' },
      { status: 500 }
    )
  }
}
