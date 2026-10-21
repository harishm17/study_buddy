import { parseSources, type SourceRef } from '@/lib/topics/sources'
import { reviewAnswer } from './quiz-questions'
import type { GradedQuestion } from '@/lib/ai-service/grading'

/** What is stored in quiz_attempts.results for each question index. */
export type StoredQuestionResult = {
  isCorrect: boolean
  pointsEarned: number
  pointsPossible: number
  // The grader's note, kept for short answers only; rule-graded questions have none.
  feedback?: string
}

/** One question as shown after a quiz is graded. This is where the answer key is released. */
export type QuizReviewItem = {
  questionIndex: number
  isCorrect: boolean
  pointsEarned: number
  pointsPossible: number
  correctAnswer: string
  explanation: string
  feedback: string | null
  /** Where in the files the question is based on, for "From <file>, p. N". Empty for older quizzes. */
  sources: SourceRef[]
}

type RawQuestion = Record<string, unknown>

export function toStoredResults(graded: GradedQuestion[]): Record<string, StoredQuestionResult> {
  const stored: Record<string, StoredQuestionResult> = {}
  for (const question of graded) {
    stored[String(question.question_index)] = {
      isCorrect: question.is_correct,
      pointsEarned: question.points_earned,
      pointsPossible: question.points_possible,
      ...(question.question_type === 'short_answer' && question.feedback
        ? { feedback: question.feedback }
        : {}),
    }
  }
  return stored
}

/** Stored results come in two shapes: the current object form and older plain booleans. */
function readStoredResult(value: unknown): Partial<StoredQuestionResult> {
  if (typeof value === 'boolean') return { isCorrect: value }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return {
      isCorrect: record.isCorrect === true,
      pointsEarned: typeof record.pointsEarned === 'number' ? record.pointsEarned : undefined,
      pointsPossible: typeof record.pointsPossible === 'number' ? record.pointsPossible : undefined,
      feedback: typeof record.feedback === 'string' ? record.feedback : undefined,
    }
  }
  return {}
}

export function buildReview(questions: RawQuestion[], results: unknown): QuizReviewItem[] {
  const resultMap = results && typeof results === 'object' ? (results as Record<string, unknown>) : {}
  return questions.map((question, index) => {
    const result = readStoredResult(resultMap[String(index)])
    const points = typeof question.points === 'number' && question.points > 0 ? question.points : 1
    const isCorrect = result.isCorrect === true
    return {
      questionIndex: index,
      isCorrect,
      pointsEarned: result.pointsEarned ?? (isCorrect ? points : 0),
      pointsPossible: result.pointsPossible ?? points,
      correctAnswer: reviewAnswer(question),
      explanation: typeof question.explanation === 'string' ? question.explanation : '',
      feedback: result.feedback ?? null,
      sources: parseSources(question.sources),
    }
  })
}
