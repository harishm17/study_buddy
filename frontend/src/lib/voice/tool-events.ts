/** What the browser is told about a tool result. Pure, so the mapping is testable. */
import type { VoiceEvent } from '@/lib/voice/turn-client'

export type ToolOutput = Record<string, unknown>

/**
 * The browser events for a tool output. Pure, so the mapping is testable:
 * a question, a graded answer, a hint, or the end of the drill.
 */
export function eventsForToolOutput(name: string, output: ToolOutput, total: number): VoiceEvent[] {
  if (name === 'get_next_question') {
    if (output.done === true) return [{ type: 'session_complete' }]
    const question = output.question as
      | { question_text?: string; question_type?: string; options?: Array<{ id: string; text: string }> }
      | undefined
    if (!question || typeof output.question_index !== 'number') return []
    const options = (question.options ?? []).filter((option) => option?.id && option?.text)
    return [
      {
        type: 'question',
        index: output.question_index,
        total,
        text: String(question.question_text ?? ''),
        questionType: String(question.question_type ?? 'conceptual'),
        ...(options.length > 0 ? { options: options.map((o) => ({ id: o.id, text: o.text })) } : {}),
      },
    ]
  }
  if (name === 'record_answer') {
    if (output.done === true) return [{ type: 'session_complete' }]
    const feedback = output.feedback as { comment?: string; explanation?: string; ungraded?: boolean } | undefined
    if (!feedback || typeof output.is_correct !== 'boolean') return []
    return [
      {
        type: 'evaluation',
        isCorrect: output.is_correct,
        score: typeof output.score === 'number' ? output.score : 0,
        comment: feedback.comment ?? '',
        explanation: feedback.explanation ?? '',
        ...(feedback.ungraded ? { ungraded: true } : {}),
      },
    ]
  }
  if (name === 'get_hint') {
    return typeof output.hint === 'string' ? [{ type: 'hint', text: output.hint }] : []
  }
  return []
}
