import { formatDueLabel, formatRelative, pluralize } from '@/lib/format'
import type { MasteryCounts } from '@/lib/mastery'

/** "12 topics, 4 strong, 2 due for review". Parts that are zero are left out. */
export function courseSummary(topicCount: number, counts: MasteryCounts, dueCount: number): string {
  const parts = [pluralize(topicCount, 'topic')]
  if (counts.strong > 0) parts.push(`${counts.strong} strong`)
  if (dueCount > 0) parts.push(`${dueCount} due for review`)
  return parts.join(', ')
}

/** Files the uploader accepts, with the words used when one is refused. */
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.doc'] as const
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',')

export type FileProblem = 'type' | 'size' | 'empty'

/** Why a file cannot be uploaded, or null when it can. The server checks again. */
export function fileProblem(file: { name: string; size: number }, maxUploadMb: number): FileProblem | null {
  const dot = file.name.lastIndexOf('.')
  const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase()
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) return 'type'
  if (file.size === 0) return 'empty'
  if (file.size > maxUploadMb * 1024 * 1024) return 'size'
  return null
}

export function problemMessage(problem: FileProblem, maxUploadMb: number): string {
  if (problem === 'type') return 'Use a PDF, DOCX, PPTX or DOC file.'
  if (problem === 'empty') return 'This file is empty.'
  return `Files can be up to ${maxUploadMb} MB.`
}

export const CATEGORY_LABELS: Record<string, string> = {
  lecture_notes: 'Lecture notes',
  sample_exams: 'Past exams',
  book_chapters: 'Book chapters',
}

export const categoryLabel = (category: string): string => CATEGORY_LABELS[category] ?? 'Materials'

/** The sort used by "Needs work": due topics first, then the lowest mastery, not started included. */
export function needsWorkOrder<T extends { mastery: number | null; dueAt: string | null; orderIndex: number }>(
  topics: T[],
  now: number
): T[] {
  const due = (topic: T) => (topic.dueAt && new Date(topic.dueAt).getTime() <= now ? 0 : 1)
  return [...topics].sort((a, b) => {
    if (due(a) !== due(b)) return due(a) - due(b)
    const left = a.mastery ?? -1
    const right = b.mastery ?? -1
    if (left !== right) return left - right
    return a.orderIndex - b.orderIndex
  })
}

/**
 * When a topic is next reviewed: "Due today" (or "Overdue 2d") for anything due by the end of
 * today in UTC, otherwise "Next review in 4 days". Null when there is no schedule yet.
 */
export function reviewTiming(dueAt: string | null, now: number): { due: boolean; text: string } | null {
  if (!dueAt) return null
  const endOfToday = new Date(now)
  endOfToday.setUTCHours(23, 59, 59, 999)
  if (new Date(dueAt) <= endOfToday) return { due: true, text: formatDueLabel(dueAt, now) }
  return { due: false, text: `Next review ${formatRelative(dueAt, now)}` }
}

export type GlyphState = 'done' | 'ready' | 'missing'

/** Notes, examples, practice and quiz states for the topics list. Practice progress lives in the browser, so it is never "done" here. */
export function studyPath(topic: {
  content: string[]
  progress: { notes: boolean; examples: boolean; quiz: boolean; quizScore: number | null }
}): { notes: GlyphState; examples: GlyphState; practice: GlyphState; quiz: GlyphState; quizScore: number | null } {
  const has = (type: string) => topic.content.includes(type)
  const state = (type: string, done: boolean): GlyphState => (done ? 'done' : has(type) ? 'ready' : 'missing')
  return {
    notes: state('section_notes', topic.progress.notes),
    examples: state('solved_examples', topic.progress.examples),
    practice: state('interactive_examples', false),
    quiz: state('topic_quiz', topic.progress.quiz),
    quizScore: topic.progress.quizScore,
  }
}
