/**
 * Google Cloud Tasks client wrapper
 * Handles enqueueing async jobs to the AI service
 */

let CloudTasksClient: any
let client: any = null

try {
  const tasks = require('@google-cloud/tasks')
  CloudTasksClient = tasks.CloudTasksClient
  client = process.env.NODE_ENV === 'production' ? new CloudTasksClient() : null
} catch (error) {
  console.warn('Cloud Tasks not available, using direct HTTP calls')
}

const PROJECT_ID = process.env.GCS_PROJECT_ID || 'studybuddy-dev'
const LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-central1'
const QUEUE = process.env.CLOUD_TASKS_QUEUE || 'studybuddy-jobs'
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

export interface TaskPayload {
  jobId: string
  jobType: string
  data: Record<string, any>
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
    // Development mode - simulate task enqueueing
    console.log(`[DEV] Simulating task enqueue to ${endpoint}:`, payload)

    // In dev, make a direct HTTP call to the AI service
    try {
      const response = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        console.error(`[DEV] Task execution failed:`, await response.text())
      }
    } catch (error) {
      console.error(`[DEV] Failed to call AI service:`, error)
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
