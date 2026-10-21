/**
 * What to tell a student when a job failed. Job error messages are written for logs and can carry
 * figures (the daily budget message does), so none of them is shown: every code gets text chosen
 * here. The budget text has the reset time as a token the browser fills in (see lib/budget/copy).
 */

import { ALLOWANCE_TEMPLATE } from '@/lib/budget/copy'

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  section_notes: 'Section notes',
  solved_examples: 'Solved examples',
  interactive_examples: 'Interactive examples',
  topic_quiz: 'Topic quiz',
}

export const contentTypeLabel = (contentType: string): string =>
  CONTENT_TYPE_LABELS[contentType] ?? 'Content'

const MESSAGES: Record<string, string> = {
  NO_SOURCE_MATERIAL:
    'None of your uploaded material matched this topic, so there was nothing to write from. Add material that covers it or edit the topic, then retry.',
  NO_CONTENT_MATERIALS:
    'Every material in this course is marked as a syllabus or a past exam, so there was nothing to find topics in. Mark at least one as course content, then find topics again.',
  LLM_RATE_LIMITED: 'The AI service is busy right now. Wait a minute and retry.',
  LLM_UNAVAILABLE: 'The AI service is not reachable right now. Retry in a few minutes.',
  LLM_CREDIT_EXHAUSTED: 'Generation is paused because the AI service account is out of credit.',
  LLM_AUTH_FAILED: 'The AI service is not set up correctly, so nothing could be generated.',
  LLM_NOT_CONFIGURED: 'The AI service is not set up correctly, so nothing could be generated.',
  LLM_BAD_OUTPUT: 'The AI returned an answer the app could not use. Retrying usually works.',
  LLM_REFUSED: 'The AI declined to write this from your material. Retrying may help.',
  LLM_REQUEST_REJECTED: 'The AI service rejected the request. Retrying may help.',
  ENQUEUE_FAILED: 'The job could not be started. Retry in a moment.',
  ENQUEUE_PERMANENT: 'The job could not be started. Retry in a moment.',
  JOB_DISPATCH_FAILED: 'The job could not be started. Retry in a moment.',
  STORAGE_UNAVAILABLE: 'Your files could not be read just now. Retry in a moment.',
}

export const FALLBACK_FAILURE_MESSAGE = 'Generation failed. Try again.'

export function describeJobFailure(
  errorCode: string | null | undefined,
  _errorMessage?: string | null
): string {
  if (errorCode === 'LLM_DAILY_BUDGET') return ALLOWANCE_TEMPLATE
  return (errorCode && MESSAGES[errorCode]) || FALLBACK_FAILURE_MESSAGE
}

/** "content:<topicId>:<contentType>" as stored on a generation job, or null for any other key. */
export function parseContentTarget(
  targetKey: string | null | undefined
): { topicId: string; contentType: string } | null {
  const match = /^content:([^:]+):([a-z_]+)$/.exec(targetKey ?? '')
  return match ? { topicId: match[1], contentType: match[2] } : null
}

export type GenerationJobRow = {
  targetKey: string | null
  status: string
  errorCode: string | null
  errorMessage: string | null
  id: string
}

export type GenerationFailure = {
  jobId: string
  topicId: string
  contentType: string
  errorCode: string | null
  message: string
}

/**
 * The failures worth showing: for each topic and content type, the most recent job counts
 * (rows must be newest first). It is a failure only if that job failed and the content is
 * still missing, so a later success or a later retry in progress clears it.
 */
export function pickGenerationFailures(
  rows: GenerationJobRow[],
  hasContent: (topicId: string, contentType: string) => boolean
): GenerationFailure[] {
  const seen = new Set<string>()
  const failures: GenerationFailure[] = []
  for (const row of rows) {
    const target = parseContentTarget(row.targetKey)
    if (!target || !row.targetKey || seen.has(row.targetKey)) continue
    seen.add(row.targetKey)
    if (row.status !== 'failed') continue
    if (hasContent(target.topicId, target.contentType)) continue
    failures.push({
      jobId: row.id,
      topicId: target.topicId,
      contentType: target.contentType,
      errorCode: row.errorCode,
      message: describeJobFailure(row.errorCode, row.errorMessage),
    })
  }
  return failures
}
