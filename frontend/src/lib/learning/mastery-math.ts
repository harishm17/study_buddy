export type MasteryComponents = {
  quiz: number
  voice: number
  exam: number
  practice: number
  recencyPenalty: number
  mastery: number
}

/** Quizzes count most, then mock exams, then voice and practice. Renormalised over the sources with data. */
export const MASTERY_WEIGHTS = { quiz: 0.45, exam: 0.25, voice: 0.15, practice: 0.15 } as const

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

const avg = (values: number[]) => {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Blend quiz, exam, voice and practice results into one 0-1 mastery value.
 *
 * The weights are renormalised over the sources that have at least one result, so a
 * student who has only taken quizzes is scored on quizzes alone: 100% on the quiz is full
 * mastery, not 0.55. A source with no data neither helps nor hurts.
 */
export function computeMasteryFromSignals(input: {
  quizScores: number[]
  voiceScores: number[]
  examScores: number[]
  practiceScores?: number[]
  daysSinceLastPractice: number
}): MasteryComponents {
  const practiceScores = input.practiceScores ?? []
  const quiz = clamp(avg(input.quizScores) / 100)
  const voice = clamp(avg(input.voiceScores))
  const exam = clamp(avg(input.examScores))
  const practice = clamp(avg(practiceScores))
  const recencyPenalty = clamp((Math.min(input.daysSinceLastPractice, 14) / 14) * 0.25, 0, 0.25)

  const sources = [
    { value: quiz, weight: MASTERY_WEIGHTS.quiz, hasData: input.quizScores.length > 0 },
    { value: voice, weight: MASTERY_WEIGHTS.voice, hasData: input.voiceScores.length > 0 },
    { value: exam, weight: MASTERY_WEIGHTS.exam, hasData: input.examScores.length > 0 },
    { value: practice, weight: MASTERY_WEIGHTS.practice, hasData: practiceScores.length > 0 },
  ].filter((source) => source.hasData)

  const totalWeight = sources.reduce((sum, source) => sum + source.weight, 0)
  const blended = totalWeight > 0
    ? sources.reduce((sum, source) => sum + source.value * source.weight, 0) / totalWeight
    : 0
  const mastery = clamp(blended - recencyPenalty)

  return { quiz, voice, exam, practice, recencyPenalty, mastery }
}

/** How many recent results of each kind feed a topic's mastery. */
export const MASTERY_HISTORY = { quiz: 5, voice: 20, exam: 20, practice: 20 } as const

/** Signals an older confidence route wrote with a copy of a past score; they are not results. */
export const isConfidenceFeedback = (metadata: unknown) =>
  !!metadata &&
  typeof metadata === 'object' &&
  (metadata as Record<string, unknown>).kind === 'confidence_feedback'

/** Groups rows (newest first) by topic and keeps the first `limit` rows of each topic. */
export function newestPerTopic<T extends { topicId: string | null }>(
  rows: T[],
  limit: number
): Map<string, T[]> {
  const byTopic = new Map<string, T[]>()
  for (const row of rows) {
    if (!row.topicId) continue
    const list = byTopic.get(row.topicId)
    if (!list) {
      byTopic.set(row.topicId, [row])
    } else if (list.length < limit) {
      list.push(row)
    }
  }
  return byTopic
}

type DatedScore = { score: number; at: Date }

/**
 * Mastery of one topic from its recent results, each list newest first and already cut to
 * its history length (exam rows with confidence feedback already removed).
 */
export function masteryFromHistory(input: {
  quiz: DatedScore[]
  voice: DatedScore[]
  exam: DatedScore[]
  practice?: DatedScore[]
  now: number
}): MasteryComponents {
  const practice = input.practice ?? []
  const latest = [input.quiz[0], input.voice[0], input.exam[0], practice[0]]
    .filter((row): row is DatedScore => !!row)
    .map((row) => row.at.getTime())
  const daysSinceLastPractice = latest.length > 0
    ? (input.now - Math.max(...latest)) / (1000 * 60 * 60 * 24)
    : 30

  return computeMasteryFromSignals({
    quizScores: input.quiz.map((row) => row.score),
    voiceScores: input.voice.map((row) => row.score),
    examScores: input.exam.map((row) => row.score),
    practiceScores: practice.map((row) => row.score),
    daysSinceLastPractice,
  })
}

export function intervalFromMastery(
  mastery: number,
  options: { wasCorrect?: boolean; confidence?: number } = {}
) {
  const { wasCorrect = true, confidence } = options
  if (!wasCorrect) return 1

  let interval = 1
  if (mastery >= 0.8) interval = 14
  else if (mastery >= 0.6) interval = 7
  else if (mastery >= 0.4) interval = 3

  if (confidence !== undefined && confidence >= 4 && wasCorrect) {
    if (interval === 1) interval = 3
    else if (interval === 3) interval = 7
    else if (interval === 7) interval = 14
  }

  return interval
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Mastery never reads lower than this share of what it was when the review fell due. */
export const DECAY_FLOOR = 0.5

/**
 * The mastery to show for a topic. Stored mastery (the review schedule's) is what the student
 * earned; once a review is overdue the displayed value fades:
 *
 *   display = mastery * 0.5^(overdueDays / (2 * intervalDays)), never below half of mastery.
 *
 * Overdue by one interval it keeps about 71%; overdue by two intervals it reaches the floor of 50%.
 * Computed when read, never stored. No schedule, a review not yet due or an unusable date returns
 * the mastery unchanged.
 */
export function displayMastery(
  mastery: number | null | undefined,
  schedule: { dueAt: Date | string | number | null | undefined; intervalDays: number | null | undefined } | null | undefined,
  now: Date | number = Date.now()
): number | null {
  if (mastery === null || mastery === undefined || Number.isNaN(mastery)) return null
  if (!schedule || schedule.dueAt === null || schedule.dueAt === undefined) return mastery
  const dueMs = new Date(schedule.dueAt).getTime()
  const nowMs = typeof now === 'number' ? now : now.getTime()
  if (!Number.isFinite(dueMs)) return mastery
  const overdueDays = (nowMs - dueMs) / DAY_MS
  if (overdueDays <= 0) return mastery
  const interval = Math.max(1, schedule.intervalDays ?? 1)
  const factor = Math.max(DECAY_FLOOR, Math.pow(0.5, overdueDays / (2 * interval)))
  return mastery * factor
}
