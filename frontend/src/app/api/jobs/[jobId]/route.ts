/**
 * API route for job status polling
 * GET /api/jobs/[jobId]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import {
  apiInternal,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
} from '@/lib/api/errors'

const stageByJobType: Record<string, string> = {
  validate_material: 'validating',
  chunk_material: 'chunking',
  extract_topics: 'extracting',
  generate_content: 'generating',
  generate_exam: 'generating',
  grade_exam: 'grading',
}

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
      return apiNotFound('Job not found')
    }

    const stage = job.stage || stageByJobType[job.jobType] || null

    return NextResponse.json({
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      progressPercent: job.progressPercent,
      stage,
      retryable: job.retryable,
      errorCode: job.errorCode,
      attemptCount: job.attemptCount,
      inputData: job.inputData,
      resultData: job.resultData,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })
  } catch (error) {
    console.error('Job status error:', error)

    if (isUnauthorizedError(error)) {
      return apiUnauthorized()
    }

    return apiInternal('Failed to fetch job status')
  }
}
