import { aiServiceHeaders } from '@/lib/ai-service/headers'

export type GradedQuestion = {
  question_index: number
  question_type: string
  points_possible: number
  points_earned: number
  is_correct: boolean
  feedback: string
  needs_review: boolean
  /** Short answers: the verdict on each key point, in rubric order. */
  criteria?: { point: string; result: 'met' | 'partly' | 'not_met' }[]
}

export type GradeResult = {
  graded_questions: GradedQuestion[]
  total_points: number
  earned_points: number
  overall_score: number
  needs_review: boolean
}

/** The AI service could not grade (down, over capacity, or a short answer failed). */
export class GradingUnavailableError extends Error {
  constructor(message = 'Grading is unavailable right now') {
    super(message)
    this.name = 'GradingUnavailableError'
  }
}

const GRADING_TIMEOUT_MS = 90_000

/**
 * Grade answers against questions the server loaded from its own database.
 * `answers` maps question index (as a string) to the student's answer.
 */
export async function gradeAnswers(
  questions: unknown[],
  answers: Record<string, string>
): Promise<GradeResult> {
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000'

  let response: Response
  try {
    response = await fetch(`${aiServiceUrl}/grade/quiz`, {
      method: 'POST',
      headers: aiServiceHeaders(),
      body: JSON.stringify({ questions, answers }),
      signal: AbortSignal.timeout(GRADING_TIMEOUT_MS),
    })
  } catch (error) {
    console.error('Grading request failed:', error)
    throw new GradingUnavailableError()
  }

  if (!response.ok) {
    console.error('Grading request returned', response.status, await response.text().catch(() => ''))
    throw new GradingUnavailableError()
  }

  const result = (await response.json()) as GradeResult
  if (result.needs_review) {
    throw new GradingUnavailableError(
      'Some short answers could not be graded just now. Your answers were not saved. Please submit again.'
    )
  }
  return result
}
