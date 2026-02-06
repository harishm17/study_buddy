import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { ensureAiGenerationReady } from '@/lib/api/ai-preflight'
import { enqueueContentGenerationJob, TaskEnqueueError } from '@/lib/tasks/cloud-tasks'
import { stableStringify } from '@/lib/utils/stable-json'
import {
  apiInternal,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
} from '@/lib/api/errors'

const REQUIRED_CONTENT_TYPES = [
  'section_notes',
  'solved_examples',
  'interactive_examples',
  'topic_quiz',
] as const

const STALE_JOB_WINDOW_MS = 6 * 60 * 1000
const PENDING_DISPATCH_STALE_MS = 90 * 1000

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const getInputString = (inputData: unknown, key: string): string | null => {
  if (!isRecord(inputData)) return null
  const value = inputData[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth()
    const { projectId } = await params

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: auth.user.id,
      },
      select: {
        id: true,
      },
    })

    if (!project) {
      return apiNotFound('Project not found')
    }

    const preflightError = await ensureAiGenerationReady()
    if (preflightError) {
      return preflightError
    }

    const staleBefore = new Date(Date.now() - STALE_JOB_WINDOW_MS)
    const pendingDispatchBefore = new Date(Date.now() - PENDING_DISPATCH_STALE_MS)

    await prisma.processingJob.updateMany({
      where: {
        projectId,
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
      },
      data: {
        status: 'failed',
        errorCode: 'STALE_JOB',
        errorMessage: 'Automatically closed stale in-flight job.',
        retryable: true,
        completedAt: new Date(),
      },
    })

    const [topics, activeGenerationJobs] = await Promise.all([
      prisma.topic.findMany({
        where: {
          projectId,
          userConfirmed: true,
        },
        select: {
          id: true,
          content: {
            select: {
              contentType: true,
            },
          },
        },
        orderBy: {
          orderIndex: 'asc',
        },
      }),
      prisma.processingJob.findMany({
        where: {
          projectId,
          jobType: 'generate_content',
          status: {
            in: ['pending', 'processing'],
          },
        },
        select: {
          inputData: true,
        },
      }),
    ])

    const activeKeys = new Set<string>()
    for (const job of activeGenerationJobs) {
      const topicId = getInputString(job.inputData, 'topicId')
      const contentType = getInputString(job.inputData, 'contentType')
      if (!topicId || !contentType) continue
      activeKeys.add(`${topicId}:${contentType}`)
    }

    const missing: Array<{ topicId: string; contentType: (typeof REQUIRED_CONTENT_TYPES)[number] }> = []
    for (const topic of topics) {
      const available = new Set(topic.content.map((item) => item.contentType))
      for (const contentType of REQUIRED_CONTENT_TYPES) {
        if (!available.has(contentType)) {
          missing.push({ topicId: topic.id, contentType })
        }
      }
    }

    if (missing.length === 0 && activeKeys.size === 0) {
      return NextResponse.json({
        queuedJobs: 0,
        skippedActive: 0,
        failedJobs: 0,
        missingBlocks: 0,
        message: 'All core content blocks are already generated.',
      })
    }

    let queuedJobs = 0
    let skippedActive = 0
    let failedJobs = 0

    for (const item of missing) {
      const key = `${item.topicId}:${item.contentType}`
      if (activeKeys.has(key)) {
        skippedActive += 1
        continue
      }

      const preferences: Record<string, never> = {}
      const idempotencyKey = `${item.topicId}:${item.contentType}:${stableStringify(preferences)}`

      const job = await prisma.processingJob.create({
        data: {
          userId: auth.user.id,
          projectId,
          jobType: 'generate_content',
          status: 'pending',
          stage: 'generating',
          inputData: {
            topicId: item.topicId,
            contentType: item.contentType,
            preferences,
            idempotencyKey,
          },
          progressPercent: 0,
        },
      })

      try {
        await enqueueContentGenerationJob(job.id, item.topicId, item.contentType, preferences)
        queuedJobs += 1
      } catch (enqueueError) {
        failedJobs += 1
        const retryable =
          enqueueError instanceof TaskEnqueueError
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
      }
    }

    const status =
      queuedJobs > 0
        ? 'queued'
        : skippedActive > 0
          ? 'already_running'
          : 'noop'

    return NextResponse.json({
      status,
      queuedJobs,
      skippedActive,
      failedJobs,
      missingBlocks: missing.length,
      message:
        queuedJobs > 0
          ? `Queued ${queuedJobs} content job${queuedJobs === 1 ? '' : 's'} in background.`
          : skippedActive > 0
            ? 'Missing content generation is already running in background.'
            : 'No content jobs were queued.',
    })
  } catch (error) {
    console.error('Generate missing content batch error:', error)
    if (isUnauthorizedError(error)) {
      return apiUnauthorized()
    }
    return apiInternal('Failed to queue missing content generation')
  }
}
