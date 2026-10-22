import { sourceText, mergeSources, type SourceRef } from '@/lib/topics/sources'

/** What the Ask box accepts. Plain module so server and client code can both import it. */
export const MAX_QUESTION_CHARS = 2000

/** The parts of the message below stay well inside the box's limit. */
const LIMITS = { question: 900, answer: 400, sources: 240 }

const clip = (text: string, limit: number): string => {
  const flat = text.replace(/\s+\n/g, '\n').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}...`
}

export type MistakeContext = {
  questionText: string
  /** What the student answered; null or empty when they left it blank. */
  studentAnswer: string | null
  /** The files and pages the question is based on. */
  sources?: readonly SourceRef[]
}

/**
 * The message "Explain this mistake" puts in the Ask box: the question, the student's answer and the
 * pages it comes from, then one plain request. It is written to be sent as it is (the student can
 * edit it first), and Ask answers it from the course files like any other question.
 */
export function explainMistakeMessage({ questionText, studentAnswer, sources = [] }: MistakeContext): string {
  const where = mergeSources(sources).map(sourceText).join('; ')
  const lines = [
    'Explain this mistake.',
    '',
    `Question: ${clip(questionText, LIMITS.question)}`,
    `My answer: ${studentAnswer?.trim() ? clip(studentAnswer, LIMITS.answer) : '(I left it blank)'}`,
  ]
  if (where) lines.push(`Where it comes from: ${clip(where, LIMITS.sources)}`)
  lines.push('', 'What did I get wrong, what is the right idea, and how can I remember it?')
  return lines.join('\n')
}

/** The Ask page for a course, scoped to a topic when there is one, with the box already filled in. */
export function explainMistakeHref(courseId: string, topicId: string | null, context: MistakeContext): string {
  const query = new URLSearchParams()
  if (topicId) query.set('topic', topicId)
  query.set('q', explainMistakeMessage(context))
  return `/courses/${courseId}/ask?${query.toString()}`
}
