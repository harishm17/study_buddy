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
  // The default code each kind of job fails with when nothing more specific is known.
  VALIDATION_FAILED: 'We could not check this file. Remove it and upload it again.',
  CHUNKING_FAILED: 'We could not read the pages of this file. Remove it and upload it again, or try another copy.',
  TOPIC_EXTRACTION_FAILED: 'We could not find the topics in your files. Try again.',
  CONTENT_GENERATION_FAILED: 'The study content could not be written. Try again.',
  EXAM_GENERATION_FAILED: 'The mock exam could not be written. Try again.',
  EXAM_GRADING_FAILED: 'We could not finish grading it. Grade the exam again to see your score.',
  EXAM_PROFILE_FAILED: 'We could not read the style of your past exams. Mock exams will use the default style.',
  EXAM_RELEVANCE_FAILED: 'We could not match your past exams to your topics. Try again.',
  MATERIAL_NOT_FOUND: 'That file was removed before it could be read.',
  SUBMISSION_NOT_FOUND: 'That exam attempt could not be found, so it could not be graded.',
  INVALID_INPUT: 'The request was not complete. Try again.',
}

/**
 * What a failure says when its code is not one of the above, by the kind of job that failed. A
 * grading job never says "Generation failed": the student reads what went wrong with the thing
 * they asked for.
 */
const FALLBACK_BY_JOB_TYPE: Record<string, string> = {
  validate_material: MESSAGES.VALIDATION_FAILED,
  chunk_material: MESSAGES.CHUNKING_FAILED,
  extract_topics: MESSAGES.TOPIC_EXTRACTION_FAILED,
  generate_content: MESSAGES.CONTENT_GENERATION_FAILED,
  generate_exam: MESSAGES.EXAM_GENERATION_FAILED,
  grade_exam: MESSAGES.EXAM_GRADING_FAILED,
}

export const FALLBACK_FAILURE_MESSAGE = 'Something went wrong. Try again.'

export function describeJobFailure(
  errorCode: string | null | undefined,
  _errorMessage?: string | null,
  jobType?: string | null
): string {
  if (errorCode === 'LLM_DAILY_BUDGET') return ALLOWANCE_TEMPLATE
  return (
    (errorCode && MESSAGES[errorCode]) || (jobType && FALLBACK_BY_JOB_TYPE[jobType]) || FALLBACK_FAILURE_MESSAGE
  )
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
      message: describeJobFailure(row.errorCode, row.errorMessage, 'generate_content'),
    })
  }
  return failures
}
