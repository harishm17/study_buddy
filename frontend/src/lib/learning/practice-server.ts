import { prisma } from '@/lib/db/prisma'
import { parsePracticeProblems } from '@/features/topic/content'
import {
  cleanSteps,
  problemFinished,
  problemScore,
  unionSteps,
  type ProblemProgress,
} from '@/features/topic/practice-keys'
import { computeTopicMastery, recordLearningSignal, upsertReviewSchedule } from './mastery'

/** A finished practice problem is "right" for scheduling the next review at this score or better. */
export const PRACTICE_PASS_SCORE = 0.5

export type PracticeSaveInput = {
  problemIndex: number
  problemTitle: string
  solvedSteps: number[]
  revealedSteps: number[]
  hintedSteps: number[]
  /** Local progress uploaded for the first time: joined with what the server has, and no signal is recorded. */
  migrated?: boolean
}

export type PracticeSaveResult =
  | { status: 'saved'; completed: boolean; completedNow: boolean; score: number | null }
  /** There is no such problem now (the practice was rewritten or has no content): nothing was stored. */
  | { status: 'stale' }

/** The practice problems of a topic as the page shows them, with the content row they belong to. */
async function currentPractice(topicId: string) {
  const row = await prisma.topicContent.findUnique({
    where: { topicId_contentType: { topicId, contentType: 'interactive_examples' } },
    select: { id: true, contentData: true, updatedAt: true },
  })
  if (!row) return null
  const parsed = parsePracticeProblems(row.contentData, row.updatedAt.toISOString())
  return parsed ? { contentId: row.id, problems: parsed.items } : null
}

/**
 * Stores the steps solved, shown and hinted of one practice problem. The row is the student's
 * state of that problem (unique on user, content and problem); sending a smaller state is how
 * "Start over" works. When the last step is closed the problem is finished: that moment, once per
 * run through the problem, records a practice learning signal (score = steps solved without a hint
 * over all steps) and updates mastery and the review schedule like a quiz does.
 */
export async function savePracticeProgress(
  userId: string,
  topic: { id: string; projectId: string },
  input: PracticeSaveInput
): Promise<PracticeSaveResult> {
  const practice = await currentPractice(topic.id)
  const problem = practice?.problems[input.problemIndex]
  if (!practice || !problem || problem.title !== input.problemTitle) return { status: 'stale' }

  const stepsTotal = problem.steps.length
  const where = { userId_contentId_problemIndex: { userId, contentId: practice.contentId, problemIndex: input.problemIndex } }
  const existing = await prisma.practiceProgress.findUnique({ where })

  let steps = cleanSteps(input, stepsTotal)
  if (input.migrated && existing && existing.problemTitle === input.problemTitle) {
    steps = cleanSteps(unionSteps(steps, existing), stepsTotal)
  }
  const progress: ProblemProgress = { problemIndex: input.problemIndex, problemTitle: input.problemTitle, ...steps }
  const finished = problemFinished(progress, stepsTotal)
  const wasFinished = !!existing?.completedAt && existing.problemTitle === input.problemTitle
  const completedAt = finished ? (wasFinished ? existing.completedAt : new Date()) : null
  const data = {
    topicId: topic.id,
    problemTitle: input.problemTitle,
    stepsSolved: steps.solvedSteps.length,
    stepsTotal,
    hintsUsed: steps.hintedSteps.length,
    solvedSteps: steps.solvedSteps,
    revealedSteps: steps.revealedSteps,
    hintedSteps: steps.hintedSteps,
    completedAt,
  }
  await prisma.practiceProgress.upsert({
    where,
    create: { userId, contentId: practice.contentId, problemIndex: input.problemIndex, ...data },
    update: data,
  })

  const completedNow = finished && !wasFinished
  const score = finished ? problemScore(progress, stepsTotal) : null
  if (completedNow && !input.migrated && score !== null) {
    await recordLearningSignal({
      userId,
      projectId: topic.projectId,
      topicId: topic.id,
      source: 'practice',
      score,
      metadata: { contentId: practice.contentId, problemIndex: input.problemIndex, problemTitle: input.problemTitle },
    })
    const mastery = await computeTopicMastery(userId, topic.projectId, topic.id)
    await upsertReviewSchedule({
      userId,
      projectId: topic.projectId,
      topicId: topic.id,
      mastery: mastery.mastery,
      wasCorrect: score >= PRACTICE_PASS_SCORE,
    })
  }
  return { status: 'saved', completed: finished, completedNow, score }
}

/** The student's stored progress on the topic's current practice problems (rows of an older practice are left out). */
export async function loadPracticeProgress(userId: string, topicId: string): Promise<ProblemProgress[]> {
  const practice = await currentPractice(topicId)
  if (!practice) return []
  const rows = await prisma.practiceProgress.findMany({
    where: { userId, topicId, contentId: practice.contentId },
    orderBy: { problemIndex: 'asc' },
  })
  return rows
    .filter((row) => practice.problems[row.problemIndex]?.title === row.problemTitle)
    .map((row) => ({
      problemIndex: row.problemIndex,
      problemTitle: row.problemTitle,
      solvedSteps: row.solvedSteps,
      revealedSteps: row.revealedSteps,
      hintedSteps: row.hintedSteps,
    }))
}
