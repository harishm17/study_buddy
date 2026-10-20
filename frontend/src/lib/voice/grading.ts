import type { VoiceQuestion } from '@/lib/voice/concept'

/**
 * A voice question reshaped for the AI service's grader.
 *
 * Spoken answers are free text, so every voice question is graded like a short answer
 * against its sample answer and key points. For a multiple-choice or true/false question
 * the correct option stands in as the sample answer ("B" would never match what a person
 * says out loud). Returns null when the question carries nothing to grade against.
 */
export function toGradableQuestion(question: VoiceQuestion): Record<string, unknown> | null {
  const keyPoints = (question.key_points || []).filter(Boolean)
  let sampleAnswer = (question.sample_answer || '').trim()
  let points = keyPoints

  if (!sampleAnswer && keyPoints.length === 0) {
    if (question.question_type === 'multiple_choice') {
      const correct = String(question.correct_answer ?? '').trim().toUpperCase()
      const option = question.options?.find((candidate) => candidate.id.toUpperCase() === correct)
      if (option) {
        sampleAnswer = `${option.id}: ${option.text}`
        points = [option.text]
      }
    } else if (question.question_type === 'true_false' && question.correct_answer !== undefined) {
      const isTrue = question.correct_answer === true || String(question.correct_answer).toLowerCase() === 'true'
      sampleAnswer = isTrue ? 'True' : 'False'
      points = [sampleAnswer]
    }
  }

  if (!sampleAnswer && points.length === 0) return null

  return {
    question_type: 'short_answer',
    question_text: question.question_text,
    sample_answer: sampleAnswer,
    key_points: points,
    // One point, so points earned / points possible is a 0-1 score.
    points: 1,
  }
}

const HINTS_BY_TYPE: Record<string, string> = {
  multiple_choice:
    'Rule out the options that contradict the main idea in the question, then compare the ones that are left.',
  true_false:
    'Check the statement for absolute words such as always or never, and think of a case where it would not hold.',
}

const DEFAULT_HINT =
  'Break the question into parts: say what the key term means, explain how or why it works, then give a consequence or an example.'

/**
 * A nudge for the coach to read out. It is built from the shape of the question, never from
 * the sample answer or the key points, so asking for hints cannot reveal the answer.
 */
export function buildHint(question: VoiceQuestion) {
  const ideaCount = (question.key_points || []).filter(Boolean).length
  return {
    hint: HINTS_BY_TYPE[question.question_type] || DEFAULT_HINT,
    ...(ideaCount > 0 ? { ideas_expected: ideaCount } : {}),
    concepts: question.concepts_tested || [],
    note: 'Give this as a nudge only. Do not state or confirm the answer.',
  }
}
