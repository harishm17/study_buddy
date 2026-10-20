export type MasteryComponents = {
  quiz: number
  voice: number
  exam: number
  recencyPenalty: number
  mastery: number
}

export const MASTERY_WEIGHTS = { quiz: 0.55, voice: 0.25, exam: 0.2 } as const

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

const avg = (values: number[]) => {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Blend quiz, voice and exam results into one 0-1 mastery value.
 *
 * The weights are renormalised over the sources that have at least one result, so a
 * student who has only taken quizzes is scored on quizzes alone: 100% on the quiz is full
 * mastery, not 0.55. A source with no data neither helps nor hurts.
 */
export function computeMasteryFromSignals(input: {
  quizScores: number[]
  voiceScores: number[]
  examScores: number[]
  daysSinceLastPractice: number
}): MasteryComponents {
  const quiz = clamp(avg(input.quizScores) / 100)
  const voice = clamp(avg(input.voiceScores))
  const exam = clamp(avg(input.examScores))
  const recencyPenalty = clamp((Math.min(input.daysSinceLastPractice, 14) / 14) * 0.25, 0, 0.25)

  const sources = [
    { value: quiz, weight: MASTERY_WEIGHTS.quiz, hasData: input.quizScores.length > 0 },
    { value: voice, weight: MASTERY_WEIGHTS.voice, hasData: input.voiceScores.length > 0 },
    { value: exam, weight: MASTERY_WEIGHTS.exam, hasData: input.examScores.length > 0 },
  ].filter((source) => source.hasData)

  const totalWeight = sources.reduce((sum, source) => sum + source.weight, 0)
  const blended = totalWeight > 0
    ? sources.reduce((sum, source) => sum + source.value * source.weight, 0) / totalWeight
    : 0
  const mastery = clamp(blended - recencyPenalty)

  return { quiz, voice, exam, recencyPenalty, mastery }
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
