/**
 * Google Cloud Tasks client wrapper
 * Handles enqueueing async jobs to the AI service
 */

let CloudTasksClient: any
let client: any = null

try {
  const tasks = require('@google-cloud/tasks')
  CloudTasksClient = tasks.CloudTasksClient
  const cloudTasksEnabled = process.env.ENABLE_CLOUD_TASKS === 'true'
  client = cloudTasksEnabled ? new CloudTasksClient() : null
  if (!cloudTasksEnabled) {
    console.log('Cloud Tasks disabled, using direct HTTP calls')
  }
} catch (error) {
  console.warn('Cloud Tasks not available, using direct HTTP calls')
}

const PROJECT_ID = process.env.GCS_PROJECT_ID || 'studybuddy-dev'
const LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-central1'
const QUEUE = process.env.CLOUD_TASKS_QUEUE || 'studybuddy-jobs'
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'
const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}
const DIRECT_TASK_TIMEOUT_MS = parsePositiveInt(process.env.DIRECT_TASK_TIMEOUT_MS, 10 * 60 * 1000)
const DIRECT_TASK_MAX_RETRIES = parsePositiveInt(process.env.DIRECT_TASK_MAX_RETRIES, 3)
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 422])
const INLINE_DIRECT_JOB_TYPES = new Set(
  String(process.env.DIRECT_INLINE_JOB_TYPES || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
)

export interface TaskPayload {
  jobId: string
  jobType: string
  data: Record<string, any>
}

export class TaskEnqueueError extends Error {
  retryable: boolean
  status?: number

  constructor(message: string, retryable = true, status?: number) {
    super(message)
    this.name = 'TaskEnqueueError'
    this.retryable = retryable
    this.status = status
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function isPermanentTaskFailure(status: number, message: string): boolean {
  if (NON_RETRYABLE_STATUSES.has(status)) {
    return true
  }
  const normalized = message.toLowerCase()
  return (
    normalized.includes('openai_api_key is not configured') ||
    normalized.includes('missing bearer') ||
    normalized.includes('authentication') ||
    normalized.includes('invalid api key')
  )
}

async function callAiServiceWithRetry(endpoint: string, payload: TaskPayload): Promise<void> {
  let attempt = 0
  let lastError: TaskEnqueueError | null = null

  while (attempt < DIRECT_TASK_MAX_RETRIES) {
    attempt += 1
    try {
      const response = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(DIRECT_TASK_TIMEOUT_MS),
      })

      if (!response.ok) {
        const message = await response.text()
        const retryable = !isPermanentTaskFailure(response.status, message)
        throw new TaskEnqueueError(
          `[DEV] Task execution failed (${response.status}): ${message}`,
          retryable,
          response.status
        )
      }
      return
    } catch (error) {
      const normalized = error instanceof TaskEnqueueError
        ? error
        : new TaskEnqueueError(String(error), true)
      lastError = normalized

      if (!normalized.retryable || attempt >= DIRECT_TASK_MAX_RETRIES) {
        break
      }

      const backoff = 250 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 120)
      await sleep(backoff)
    }
  }

  throw lastError || new TaskEnqueueError('Unknown task enqueue failure')
}

async function markJobFailed(
  payload: TaskPayload,
  error: TaskEnqueueError
): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db/prisma')
    await prisma.processingJob.updateMany({
      where: {
        id: payload.jobId,
        status: { in: ['pending', 'processing'] },
      },
      data: {
        status: 'failed',
        errorCode: error.retryable ? 'ENQUEUE_FAILED' : 'ENQUEUE_PERMANENT',
        errorMessage: error.message.slice(0, 1000),
        retryable: error.retryable,
        completedAt: new Date(),
      },
    })
  } catch (dbError) {
    console.error('[DEV] Failed to persist enqueue failure:', dbError)
  }
}

async function dispatchDirectTask(endpoint: string, payload: TaskPayload): Promise<void> {
  try {
    await callAiServiceWithRetry(endpoint, payload)
  } catch (error) {
    const normalized = error instanceof TaskEnqueueError
      ? error
      : new TaskEnqueueError(String(error), true)
    console.error(`[DEV] Background task dispatch failed for ${payload.jobId}:`, normalized.message)
    await markJobFailed(payload, normalized)
  }
}

async function runInlineDirectTask(endpoint: string, payload: TaskPayload): Promise<void> {
  try {
    await callAiServiceWithRetry(endpoint, payload)
  } catch (error) {
    const normalized = error instanceof TaskEnqueueError
      ? error
      : new TaskEnqueueError(String(error), true)
    await markJobFailed(payload, normalized)
    throw normalized
  }
}

if (!client && INLINE_DIRECT_JOB_TYPES.size > 0) {
  console.warn(
    `[DEV] Inline direct tasks enabled for: ${Array.from(INLINE_DIRECT_JOB_TYPES).join(', ')}`
  )
}

/**
 * Enqueue a task to Cloud Tasks
 * @param endpoint - AI service endpoint (e.g., /jobs/validate-material)
 * @param payload - Task payload
 * @returns Task name
 */
export async function enqueueTask(
  endpoint: string,
  payload: TaskPayload
): Promise<string> {
  if (!client) {
    if (INLINE_DIRECT_JOB_TYPES.has(payload.jobType)) {
      // For user-driven short tasks, run inline in direct mode to reduce queue lag.
      console.log(`[DEV] Running inline task ${payload.jobType} (${payload.jobId})`)
      await runInlineDirectTask(endpoint, payload)
    } else {
      // Heavy/background tasks remain non-blocking.
      console.log(`[DEV] Enqueueing background task ${payload.jobType} (${payload.jobId})`)
      queueMicrotask(() => {
        void dispatchDirectTask(endpoint, payload)
      })
    }

    return `dev-task-${payload.jobId}`
  }

  // Production mode - use Cloud Tasks
  const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE)

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${AI_SERVICE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
    },
  }

  const [response] = await client.createTask({ parent, task })
  return response.name || `task-${payload.jobId}`
}

/**
 * Enqueue a material validation job
 * @param jobId - Processing job ID
 * @param materialId - Material ID to validate
 * @returns Task name
 */
export async function enqueueValidationJob(
  jobId: string,
  materialId: string
): Promise<string> {
  return enqueueTask('/jobs/validate-material', {
    jobId,
    jobType: 'validate_material',
    data: { materialId },
  })
}

/**
 * Enqueue a topic extraction job
 * @param jobId - Processing job ID
 * @param projectId - Project ID
 * @returns Task name
 */
export async function enqueueTopicExtractionJob(
  jobId: string,
  projectId: string
): Promise<string> {
  return enqueueTask('/jobs/extract-topics', {
    jobId,
    jobType: 'extract_topics',
    data: { projectId },
  })
}

/**
 * Enqueue a content generation job
 * @param jobId - Processing job ID
 * @param topicId - Topic ID
 * @param contentType - Type of content to generate
 * @param preferences - Generation preferences
 * @returns Task name
 */
export async function enqueueContentGenerationJob(
  jobId: string,
  topicId: string,
  contentType: string,
  preferences: Record<string, any>
): Promise<string> {
  return enqueueTask('/jobs/generate-content', {
    jobId,
    jobType: 'generate_content',
    data: { topicId, contentType, preferences },
  })
}

/**
 * Enqueue a chunking job
 * @param jobId - Processing job ID
 * @param materialId - Material ID to chunk
 * @returns Task name
 */
export async function enqueueChunkingJob(
  jobId: string,
  materialId: string
): Promise<string> {
  return enqueueTask('/jobs/chunk-material', {
    jobId,
    jobType: 'chunk_material',
    data: { materialId },
  })
}

/**
 * Enqueue an exam grading job
 * @param jobId - Processing job ID
 * @param submissionId - Exam submission ID
 * @param examId - Exam ID
 * @param questions - Exam questions
 * @param answers - Student answers
 * @returns Task name
 */
export async function enqueueExamGradingJob(
  jobId: string,
  submissionId: string,
  examId: string,
  questions: any[],
  answers: Record<string, any>
): Promise<string> {
  return enqueueTask('/jobs/grade-exam', {
    jobId,
    jobType: 'grade_exam',
    data: { submissionId, examId, questions, answers },
  })
}
