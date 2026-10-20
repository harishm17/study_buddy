/**
 * One active job per target.
 *
 * ProcessingJob.targetKey names what a job acts on. A partial unique index allows only one
 * pending/processing job per key, so two requests (or a request and the AI service's own
 * follow-up job) cannot both start the same work. Creators call createJobOrFindActive and
 * return the existing job when the insert loses the race.
 */

import { Prisma, type ProcessingJob } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

export const ACTIVE_JOB_STATUSES = ['pending', 'processing']

// A job that was never picked up (the dispatcher died before the AI service claimed it)
// is closed after this long so the user can start it again.
const UNDISPATCHED_JOB_MS = 90 * 1000

export const extractTopicsTarget = (projectId: string) => `extract:${projectId}`
export const generateContentTarget = (topicId: string, contentType: string) =>
  `content:${topicId}:${contentType}`
export const gradeExamTarget = (userId: string, idempotencyKey: string) =>
  `grade:${userId}:${idempotencyKey}`

type NewJob = Prisma.ProcessingJobUncheckedCreateInput & { targetKey: string }

export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

/** Fail matching jobs that were created long ago and never started. */
export async function closeUndispatchedJobs(
  where: Prisma.ProcessingJobWhereInput
): Promise<void> {
  await prisma.processingJob.updateMany({
    where: {
      ...where,
      status: 'pending',
      startedAt: null,
      createdAt: { lt: new Date(Date.now() - UNDISPATCHED_JOB_MS) },
    },
    data: {
      status: 'failed',
      errorCode: 'STALE_JOB',
      errorMessage: 'Automatically closed a job that never started. Please retry.',
      retryable: true,
      completedAt: new Date(),
    },
  })
}

/**
 * Create the job, or return the pending/processing job that already has this targetKey.
 * `created` is false when an existing job was returned.
 */
export async function createJobOrFindActive(
  data: NewJob
): Promise<{ job: ProcessingJob; created: boolean }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await prisma.processingJob.findFirst({
      where: { targetKey: data.targetKey, status: { in: ACTIVE_JOB_STATUSES } },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) return { job: existing, created: false }

    try {
      const job = await prisma.processingJob.create({ data })
      return { job, created: true }
    } catch (error) {
      // Lost the race to another request: loop and return the winner.
      if (!isUniqueViolation(error)) throw error
    }
  }
  throw new Error(`Could not create or find a job for ${data.targetKey}`)
}
