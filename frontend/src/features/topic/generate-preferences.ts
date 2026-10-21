import type { ContentKind } from './types'

export type Difficulty = 'easy' | 'medium' | 'hard'
export type DetailLevel = 'brief' | 'moderate' | 'comprehensive'
export type QuestionType = 'multiple_choice' | 'short_answer' | 'numerical' | 'true_false'

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'numerical', label: 'Numerical' },
  { value: 'true_false', label: 'True or false' },
]

/** How a generation was started: first time, replacing what exists, or adding to it. */
export type GenerateMode = 'create' | 'regenerate' | 'more'

export type GenerateForm = {
  detail: DetailLevel
  count: number
  questionCount: number
  difficulty: Difficulty
  focus: string
  types: QuestionType[]
}

export const FOCUS_MIN = 3
export const FOCUS_MAX = 280

export function defaultForm(mode: GenerateMode): GenerateForm {
  return {
    detail: 'moderate',
    count: mode === 'more' ? 2 : 3,
    questionCount: 10,
    difficulty: 'medium',
    focus: '',
    types: QUESTION_TYPES.map((type) => type.value),
  }
}

/** A message when the form cannot be sent, or null. */
export function validateForm(kind: ContentKind, form: GenerateForm): { focus?: string; types?: string } {
  const errors: { focus?: string; types?: string } = {}
  const focus = form.focus.trim()
  if (kind !== 'notes' && focus && focus.length < FOCUS_MIN) errors.focus = `Use at least ${FOCUS_MIN} characters.`
  if (focus.length > FOCUS_MAX) errors.focus = `Keep it under ${FOCUS_MAX} characters.`
  if (kind === 'quiz' && form.types.length === 0) errors.types = 'Pick at least one type.'
  return errors
}

/** The `preferences` body of generate-content and regenerate-content for a form. */
export function buildPreferences(kind: ContentKind, form: GenerateForm, mode: GenerateMode): Record<string, unknown> {
  const focus = form.focus.trim()
  if (kind === 'notes') {
    return { detail_level: form.detail }
  }
  if (kind === 'quiz') {
    return {
      question_count: form.questionCount,
      difficulty_level: form.difficulty,
      ...(focus ? { focus } : {}),
      ...(form.types.length > 0 && form.types.length < QUESTION_TYPES.length ? { question_types: form.types } : {}),
    }
  }
  return {
    count: form.count,
    difficulty_level: form.difficulty,
    ...(focus ? { focus } : {}),
    ...(mode === 'more' ? { append: true } : {}),
  }
}
