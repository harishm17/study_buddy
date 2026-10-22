/**
 * What a short answer was graded against: the key points of its rubric, and, when the grader said,
 * whether each one was met. Points are not split per line (the grader gives one score for the whole
 * answer), so a line says met, partly or missing, and the score is shown for the answer as a whole.
 */

export type RubricResult = 'met' | 'partly' | 'not_met'

export type RubricLine = { text: string; result: RubricResult | null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isResult = (value: unknown): value is RubricResult => value === 'met' || value === 'partly' || value === 'not_met'

/** What the grader returned per key point, as stored: [{ point, result }] in rubric order. */
export type StoredCriterion = { point: string; result: RubricResult }

export function readCriteria(value: unknown): StoredCriterion[] {
  if (!Array.isArray(value)) return []
  const out: StoredCriterion[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.point !== 'string' || !isResult(item.result)) return []
    out.push({ point: item.point, result: item.result })
  }
  return out
}

/**
 * The rubric of a short-answer question, or null for any other kind (or a question with no key
 * points). The verdicts apply only when there is one per line, in order; otherwise the lines are
 * listed as "what the grader looked for" with no marks.
 */
export function buildRubric(question: Record<string, unknown>, criteria: unknown): RubricLine[] | null {
  if (question.question_type !== 'short_answer') return null
  const points = Array.isArray(question.key_points)
    ? question.key_points.filter((point): point is string => typeof point === 'string' && point.trim() !== '')
    : []
  if (points.length === 0) return null
  const verdicts = readCriteria(criteria)
  const usable = verdicts.length === points.length
  return points.map((text, index) => ({ text, result: usable ? verdicts[index].result : null }))
}
