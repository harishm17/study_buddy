import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import { pickGenerationFailures } from '@/lib/jobs/failure-message'
import { asQuestionList, toPublicQuestions, type PublicQuizQuestion } from '@/lib/learning/quiz-questions'
import { buildReview, type QuizReviewItem } from '@/lib/learning/quiz-review'
import { masteryLevel, type MasteryLevel } from '@/lib/mastery'
import { parseNotes, parsePracticeProblems, parseSolvedExamples } from '@/features/topic/content'
import {
  CONTENT_TYPE_BY_KIND,
  KIND_BY_CONTENT_TYPE,
  type ContentKind,
  type ExamplesContent,
  type NotesContent,
  type PracticeContent,
} from '@/features/topic/types'
import { getCourseShell } from './courses'

/**
 * The read model of the topic page. Everything is filtered by the user id. Quiz sets are read
 * here (no API lists them) and go through `toPublicQuestions`, so an answer key never reaches
 * the browser before a quiz is submitted. Past attempts are already graded, so their review
 * (which carries the key) is included, as the quiz-attempts route does.
 */

export type QuizSetData = {
  /** The set's id, or "legacy" for the quiz stored before sets existed. */
  id: string
  /** "Set 3": sets are numbered oldest first. */
  label: string
  createdAt: string
  questions: PublicQuizQuestion[]
}

export type QuizAttemptData = {
  id: string
  score: number
  takenAt: string
  setId: string
  answers: Record<string, string>
  /** Null when the set it was taken on no longer exists. */
  review: QuizReviewItem[] | null
}

export type TopicFailure = { message: string; errorCode: string | null }

export type TopicNeighbour = { id: string; name: string }

export type TopicPageData = {
  course: { id: string; name: string }
  topic: {
    id: string
    name: string
    description: string | null
    mastery: number | null
    masteryLevel: MasteryLevel
    dueAt: string | null
    /** Days until the review is due by the server's clock; zero or less means due now. */
    daysUntilDue: number | null
    progress: { notes: boolean; examples: boolean; quiz: boolean; quizScore: number | null }
  }
  previous: TopicNeighbour | null
  next: TopicNeighbour | null
  content: {
    notes: NotesContent | null
    examples: ExamplesContent | null
    practice: PracticeContent | null
    quiz: { sets: QuizSetData[]; updatedAt: string } | null
  }
  /** Which content kinds exist, for the tabs. */
  present: Record<ContentKind, boolean>
  /** Changes whenever any content is rewritten, so a client can tell a refresh has landed. */
  contentVersion: string
  attempts: QuizAttemptData[]
  /** Kinds whose latest generation failed and that still have no content. */
  failures: Partial<Record<ContentKind, TopicFailure>>
}

const RECENT_ATTEMPTS = 30
const REVIEWED_ATTEMPTS = 10

const toAnswers = (value: unknown): Record<string, string> => {
  const answers: Record<string, string> = {}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, answer] of Object.entries(value as Record<string, unknown>)) {
      if (typeof answer === 'string') answers[key] = answer
    }
  }
  return answers
}

export const getTopicPage = cache(async function getTopicPage(
  userId: string,
  courseId: string,
  topicId: string
): Promise<TopicPageData | null> {
  const course = await getCourseShell(userId, courseId)
  const index = course?.topics.findIndex((item) => item.id === topicId) ?? -1
  if (!course || index < 0) return null
  const shellTopic = course.topics[index]

  const [contentRows, quizRows, attemptRows, jobRows] = await Promise.all([
    prisma.topicContent.findMany({
      where: { topicId },
      select: { contentType: true, contentData: true, metadata: true, updatedAt: true },
    }),
    prisma.topicQuiz.findMany({
      where: { topicId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, questions: true, createdAt: true },
    }),
    prisma.quizAttempt.findMany({
      where: { topicId, userId },
      orderBy: { takenAt: 'desc' },
      take: RECENT_ATTEMPTS,
      select: { id: true, score: true, takenAt: true, quizSetId: true, answers: true, results: true },
    }),
    prisma.processingJob.findMany({
      where: { userId, jobType: 'generate_content', targetKey: { startsWith: `content:${topicId}:` } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, targetKey: true, status: true, errorCode: true, errorMessage: true },
    }),
  ])

  const byType = new Map(contentRows.map((row) => [row.contentType, row]))
  const iso = (date: Date) => date.toISOString()

  const notesRow = byType.get(CONTENT_TYPE_BY_KIND.notes)
  const examplesRow = byType.get(CONTENT_TYPE_BY_KIND.examples)
  const practiceRow = byType.get(CONTENT_TYPE_BY_KIND.practice)
  const quizRow = byType.get(CONTENT_TYPE_BY_KIND.quiz)

  // Quiz sets, newest first. Without any set rows the legacy copy in topic_content is the quiz.
  const storedSets = quizRows
    .map((row) => ({ row, questions: asQuestionList(row.questions) }))
    .filter((item): item is { row: (typeof quizRows)[number]; questions: Record<string, unknown>[] } => !!item.questions)
  const legacyQuestions = asQuestionList(quizRow?.contentData)

  const fullSets = new Map<string, Record<string, unknown>[]>()
  const sets: QuizSetData[] = []
  if (storedSets.length > 0) {
    storedSets.forEach(({ row, questions }, position) => {
      fullSets.set(row.id, questions)
      sets.push({
        id: row.id,
        label: `Set ${position + 1}`,
        createdAt: iso(row.createdAt),
        questions: toPublicQuestions(questions),
      })
    })
    sets.reverse()
  } else if (legacyQuestions && quizRow) {
    fullSets.set('legacy', legacyQuestions)
    sets.push({
      id: 'legacy',
      label: 'Set 1',
      createdAt: iso(quizRow.updatedAt),
      questions: toPublicQuestions(legacyQuestions),
    })
  }
  if (legacyQuestions) fullSets.set('legacy', legacyQuestions)

  const attempts: QuizAttemptData[] = attemptRows.map((attempt, position) => {
    const setId = attempt.quizSetId ?? 'legacy'
    const questions = fullSets.get(setId)
    return {
      id: attempt.id,
      score: attempt.score,
      takenAt: iso(attempt.takenAt),
      setId,
      answers: toAnswers(attempt.answers),
      review: position < REVIEWED_ATTEMPTS && questions ? buildReview(questions, attempt.results) : null,
    }
  })

  const content: TopicPageData['content'] = {
    notes: notesRow ? parseNotes(notesRow.contentData, notesRow.metadata, iso(notesRow.updatedAt)) : null,
    examples: examplesRow ? parseSolvedExamples(examplesRow.contentData, iso(examplesRow.updatedAt)) : null,
    practice: practiceRow ? parsePracticeProblems(practiceRow.contentData, iso(practiceRow.updatedAt)) : null,
    quiz: sets.length > 0 ? { sets, updatedAt: sets[0].createdAt } : null,
  }
  const present: Record<ContentKind, boolean> = {
    notes: !!content.notes,
    examples: !!content.examples,
    practice: !!content.practice,
    quiz: !!content.quiz,
  }

  const failures: TopicPageData['failures'] = {}
  for (const failure of pickGenerationFailures(jobRows, (_topic, contentType) => {
    const kind = KIND_BY_CONTENT_TYPE[contentType]
    return !kind || present[kind]
  })) {
    const kind = KIND_BY_CONTENT_TYPE[failure.contentType]
    if (kind) failures[kind] = { message: failure.message, errorCode: failure.errorCode }
  }

  const contentVersion = [
    ...contentRows.map((row) => `${row.contentType}:${row.updatedAt.getTime()}`),
    ...quizRows.map((row) => row.id),
  ]
    .sort()
    .join('|')

  return {
    course: { id: course.id, name: course.name },
    topic: {
      id: shellTopic.id,
      name: shellTopic.name,
      description: shellTopic.description,
      mastery: shellTopic.mastery,
      masteryLevel: masteryLevel(shellTopic.mastery),
      dueAt: shellTopic.dueAt,
      daysUntilDue: shellTopic.dueAt ? (Date.parse(shellTopic.dueAt) - Date.now()) / 86_400_000 : null,
      progress: shellTopic.progress,
    },
    previous: index > 0 ? { id: course.topics[index - 1].id, name: course.topics[index - 1].name } : null,
    next:
      index < course.topics.length - 1
        ? { id: course.topics[index + 1].id, name: course.topics[index + 1].name }
        : null,
    content,
    present,
    contentVersion,
    attempts,
    failures,
  }
})
