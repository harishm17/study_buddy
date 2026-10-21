/** Shared by the topic page's server read model and its client views. */

export type ViewId = 'notes' | 'examples' | 'practice' | 'quiz' | 'voice'

export const VIEW_IDS: ViewId[] = ['notes', 'examples', 'practice', 'quiz', 'voice']

export const VIEW_LABELS: Record<ViewId, string> = {
  notes: 'Notes',
  examples: 'Worked examples',
  practice: 'Practice',
  quiz: 'Quiz',
  voice: 'Voice review',
}

/** The four kinds of generated content; the voice view has none. */
export type ContentKind = 'notes' | 'examples' | 'practice' | 'quiz'

export const CONTENT_KINDS: ContentKind[] = ['notes', 'examples', 'practice', 'quiz']

export const CONTENT_TYPE_BY_KIND: Record<ContentKind, string> = {
  notes: 'section_notes',
  examples: 'solved_examples',
  practice: 'interactive_examples',
  quiz: 'topic_quiz',
}

export const KIND_BY_CONTENT_TYPE: Record<string, ContentKind> = {
  section_notes: 'notes',
  solved_examples: 'examples',
  interactive_examples: 'practice',
  topic_quiz: 'quiz',
}

export const isViewId = (value: unknown): value is ViewId =>
  typeof value === 'string' && (VIEW_IDS as string[]).includes(value)

export type TopicCitation = {
  filename: string
  /** "4", "4-5", or null when the file has no pages (a Word document, say). */
  pages: string | null
  materialId: string | null
  page: number | null
}

export type NotesContent = {
  text: string
  citations: TopicCitation[]
  updatedAt: string
}

export type SolvedStep = {
  number: number
  description: string
  work: string
  explanation: string
}

export type SolvedExample = {
  title: string
  problem: string
  steps: SolvedStep[]
  finalAnswer: string
  keyConcepts: string[]
  difficulty: 'easy' | 'medium' | 'hard' | null
}

export type ExamplesContent = { items: SolvedExample[]; updatedAt: string }

export type PracticeStep = {
  number: number
  question: string
  hint: string
  answerType: 'numeric' | 'text' | 'multiple_choice'
  correctAnswer: string
  acceptableAnswers: string[]
  explanation: string
  feedbackCorrect: string
  feedbackIncorrect: string
}

export type PracticeProblem = {
  title: string
  problem: string
  steps: PracticeStep[]
  keyConcepts: string[]
  difficulty: string | null
  minutes: number | null
}

export type PracticeContent = { items: PracticeProblem[]; updatedAt: string }
