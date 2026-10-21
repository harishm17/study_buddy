/** The choices on the new mock exam form, and the rules that turn them into a request. */
import { formatDate } from '@/lib/format'
import { LEARNING_BELOW, STRONG_FROM } from '@/lib/mastery'

export const QUESTION_COUNTS = [10, 20, 30, 40] as const
export const TIME_LIMITS = [30, 60, 90, 120, 180] as const
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export type QuestionTypeDistribution = { multiple_choice: number; short_answer: number; numerical: number }

export const QUESTION_MIXES = {
  balanced: { label: 'Balanced', distribution: { multiple_choice: 60, short_answer: 30, numerical: 10 } },
  concepts: { label: 'More concepts', distribution: { multiple_choice: 40, short_answer: 50, numerical: 10 } },
  calculation: { label: 'More calculation', distribution: { multiple_choice: 40, short_answer: 20, numerical: 40 } },
} as const satisfies Record<string, { label: string; distribution: QuestionTypeDistribution }>

export type QuestionMix = keyof typeof QUESTION_MIXES

export const DEFAULT_EXAM_CONFIG = {
  totalQuestions: 20,
  durationMinutes: 60,
  difficultyLevel: 'medium' as Difficulty,
  mix: 'balanced' as QuestionMix,
}

type TopicSignal = { id: string; mastery: number | null; dueAt: string | null }

/**
 * Topics worth testing: those due for review or not yet Strong (including ones with no signal).
 * When every topic is already strong, all of them.
 */
export function preselectTopics(topics: readonly TopicSignal[], now: number): string[] {
  const wanted = topics.filter(
    (topic) =>
      topic.mastery === null ||
      topic.mastery < STRONG_FROM ||
      (topic.dueAt !== null && new Date(topic.dueAt).getTime() <= now)
  )
  return (wanted.length > 0 ? wanted : topics).map((topic) => topic.id)
}

/** True when a topic's mastery is low enough to show the warning tone. */
export const isLowMastery = (mastery: number | null): boolean => mastery !== null && mastery < LEARNING_BELOW

const GENERATED_NAME = /^Sample Exam - \d{4}-\d{2}-\d{2}$/

/** "Sample exam, Oct 20" for generated names; a custom name is kept as it is. */
export function examTitle(name: string, createdAt: string | Date): string {
  return GENERATED_NAME.test(name) ? `Sample exam, ${formatDate(createdAt)}` : name
}

const DIFFICULTY_LABELS: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
export const difficultyLabel = (value: string): string => DIFFICULTY_LABELS[value] ?? value

/** "20 questions, 60 min, medium". */
export function examSummary(facts: { questionCount: number; durationMinutes: number; difficulty: string }): string {
  const questions = `${facts.questionCount} ${facts.questionCount === 1 ? 'question' : 'questions'}`
  return `${questions}, ${formatMinutes(facts.durationMinutes)}, ${facts.difficulty.toLowerCase()}`
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

/** A 0..100 score as "72%", with at most one decimal. */
export function formatScore(score: number): string {
  const rounded = Math.round(score * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}
