import { answerUnit, type PublicQuizQuestion } from '@/lib/learning/quiz-questions'

/** An answer as the student reads it: "B. O(V + E)", "True", "9.8 m/s", or their own words. */
export function formatAnswer(question: PublicQuizQuestion, answer: string | null | undefined): string {
  const value = (answer ?? '').trim()
  if (!value) return ''
  if (question.question_type === 'multiple_choice') {
    const option = question.options?.find((item) => item.id.toLowerCase() === value.toLowerCase())
    return option ? `${option.id}. ${option.text}` : value
  }
  if (question.question_type === 'true_false') {
    return value.toLowerCase() === 'true' ? 'True' : value.toLowerCase() === 'false' ? 'False' : value
  }
  if (question.question_type === 'numerical' && answerUnit(question.unit)) return `${value} ${answerUnit(question.unit)}`
  return value
}

/** How the stored correct answer reads: the same shapes as `formatAnswer` (the key is text already). */
export function formatKey(question: PublicQuizQuestion, key: string): string {
  if (question.question_type === 'multiple_choice') return formatAnswer(question, key)
  return key
}

export type ReviewState = 'correct' | 'partial' | 'wrong'

/** Full marks is correct, some marks is partial, none is wrong. */
export function reviewState(item: { isCorrect: boolean; pointsEarned: number }): ReviewState {
  if (item.isCorrect) return 'correct'
  return item.pointsEarned > 0 ? 'partial' : 'wrong'
}
