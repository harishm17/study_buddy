/**
 * API route for job status polling
 * GET /api/jobs/[jobId]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await requireAuth()
    const { jobId } = await params

    // Fetch job and verify ownership
    const job = await prisma.processingJob.findFirst({
      where: {
        id: jobId,
        userId: session.user.id,
      },
    })

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      progressPercent: job.progressPercent,
      inputData: job.inputData,
      resultData: job.resultData,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })
  } catch (error) {
    console.error('Job status error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    )
  }
}
