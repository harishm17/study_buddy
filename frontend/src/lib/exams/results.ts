/**
 * Turns a graded exam submission into what the results page shows: one entry per question
 * and a per-topic summary. This is where the exam's answer key is released, so callers must
 * only use it for a submitted, graded submission.
 */

import { reviewAnswer } from '@/lib/learning/quiz-questions'
import { parseSources, type SourceRef } from '@/lib/topics/sources'

type RawQuestion = Record<string, unknown>

export type ExamQuestionResult = {
  questionIndex: number
  questionType: string
  questionText: string
  topicId: string | null
  topicName: string | null
  studentAnswer: string | null
  correctAnswer: string
  points: number
  pointsEarned: number
  isCorrect: boolean
  feedback: string | null
  needsReview: boolean
  /** Where in the files the question is based on (empty for exams written before sources existed). */
  sources: SourceRef[]
}

export type WeakTopic = {
  topicId: string | null
  topicName: string
  pointsEarned: number
  pointsPossible: number
  /** 0 to 100 */
  percent: number
}

const isRecord = (value: unknown): value is RawQuestion =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

/** The student's answer as text, or null when the question was left blank. */
export function displayStudentAnswer(question: RawQuestion, answer: unknown): string | null {
  if (answer === undefined || answer === null) return null
  if (typeof answer === 'string' && answer.trim() === '') return null
  switch (question.question_type) {
    case 'true_false':
      return answer === true || String(answer).trim().toLowerCase() === 'true' ? 'True' : 'False'
    case 'multiple_choice': {
      const options = Array.isArray(question.options) ? question.options.filter(isRecord) : []
      const picked = options.find((option) => String(option.id).toUpperCase() === String(answer).trim().toUpperCase())
      return picked ? `${String(picked.id)}. ${String(picked.text)}` : String(answer)
    }
    case 'numerical': {
      const unit = asString(question.unit)
      return unit ? `${String(answer)} ${unit}` : String(answer)
    }
    default:
      return String(answer)
  }
}

/** The correct answer as text. For multiple choice the option text follows the letter. */
function displayCorrectAnswer(question: RawQuestion, graded: RawQuestion | undefined): string {
  const fromQuestion = reviewAnswer(question)
  if (question.question_type === 'multiple_choice') {
    const options = Array.isArray(question.options) ? question.options.filter(isRecord) : []
    const key = String(question.correct_answer ?? graded?.correct_answer ?? '').trim()
    const option = options.find((item) => String(item.id).toUpperCase() === key.toUpperCase())
    if (option) return `${String(option.id)}. ${String(option.text)}`
    return key
  }
  if (fromQuestion) return fromQuestion
  return graded?.correct_answer === undefined || graded?.correct_answer === null ? '' : String(graded.correct_answer)
}

/**
 * One result per stored question. Grading data is matched by question index; a question
 * the grader did not return is shown as ungraded with 0 points.
 */
export function buildQuestionResults(
  questions: unknown,
  aiGrading: unknown,
  answers: unknown
): ExamQuestionResult[] {
  const questionList = Array.isArray(questions) ? questions.filter(isRecord) : []
  const gradedList =
    isRecord(aiGrading) && Array.isArray(aiGrading.graded_questions)
      ? aiGrading.graded_questions.filter(isRecord)
      : []
  const gradedByIndex = new Map<number, RawQuestion>()
  for (const item of gradedList) {
    if (typeof item.question_index === 'number') gradedByIndex.set(item.question_index, item)
  }
  const answerMap = isRecord(answers) ? answers : {}

  return questionList.map((question, index) => {
    const graded = gradedByIndex.get(index)
    const points = asNumber(graded?.points_possible, asNumber(question.points, 1))
    const earned = asNumber(graded?.points_earned, 0)
    return {
      questionIndex: index,
      questionType: String(question.question_type ?? ''),
      questionText: String(question.question_text ?? ''),
      topicId: asString(question.topic_id),
      topicName: asString(question.topic_name),
      studentAnswer: displayStudentAnswer(question, answerMap[String(index)]),
      correctAnswer: displayCorrectAnswer(question, graded),
      points,
      pointsEarned: earned,
      isCorrect: graded?.is_correct === true,
      feedback: asString(graded?.feedback),
      needsReview: graded?.needs_review === true,
      sources: parseSources(question.sources ?? graded?.sources),
    }
  })
}

/**
 * Score per topic, weakest first. Ties go to the topic with more points at stake. Questions
 * without a topic are left out, as are topics worth no points.
 */
export function summarizeTopics(results: ExamQuestionResult[]): WeakTopic[] {
  const byTopic = new Map<string, WeakTopic>()
  for (const result of results) {
    if (!result.topicId && !result.topicName) continue
    const key = result.topicId ?? `name:${result.topicName}`
    const entry =
      byTopic.get(key) ??
      ({
        topicId: result.topicId,
        topicName: result.topicName ?? 'Topic',
        pointsEarned: 0,
        pointsPossible: 0,
        percent: 0,
      } satisfies WeakTopic)
    entry.pointsEarned += result.pointsEarned
    entry.pointsPossible += result.points
    byTopic.set(key, entry)
  }
  return [...byTopic.values()]
    .filter((topic) => topic.pointsPossible > 0)
    .map((topic) => ({
      ...topic,
      percent: Math.round((topic.pointsEarned / topic.pointsPossible) * 1000) / 10,
    }))
    .sort((a, b) => a.percent - b.percent || b.pointsPossible - a.pointsPossible)
}

/** The overall figures stored with the grading, tolerant of missing fields. */
export function readOverall(aiGrading: unknown): { score: number; earned: number; total: number } | null {
  if (!isRecord(aiGrading) || typeof aiGrading.overall_score !== 'number') return null
  return {
    score: aiGrading.overall_score,
    earned: asNumber(aiGrading.earned_points, 0),
    total: asNumber(aiGrading.total_points, 0),
  }
}
