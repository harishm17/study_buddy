/**
 * Timing and answer rules for a timed exam attempt. Pure functions: the server clock is the
 * only clock that counts, and everything here takes `now` as an argument.
 */

/** Answers still count this long after the deadline, to cover the round trip of an auto-submit. */
export const DEADLINE_GRACE_MS = 15_000

/** Autosave never keeps more than this many characters for one answer. */
export const MAX_ANSWER_LENGTH = 20_000

export type AnswerValue = string | number | boolean | null
export type AnswerMap = Record<string, AnswerValue>

export function deadlineFor(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60_000)
}

/** Whole seconds left, rounded up, never below 0. */
export function remainingSeconds(deadlineAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadlineAt.getTime() - now.getTime()) / 1000))
}

/** True while answers are still accepted: up to the deadline plus the grace period. */
export function acceptsAnswers(deadlineAt: Date, now: Date, graceMs = DEADLINE_GRACE_MS): boolean {
  return now.getTime() <= deadlineAt.getTime() + graceMs
}

/** True once the time (and grace) is over, so an unfinished attempt should be submitted as saved. */
export function isExpired(deadlineAt: Date, now: Date, graceMs = DEADLINE_GRACE_MS): boolean {
  return !acceptsAnswers(deadlineAt, now, graceMs)
}

/**
 * What a submission is graded on. Within the time limit the answers sent with the submit
 * request win (they are the student's final state). After it, only what was saved before the
 * deadline counts, so answers cannot be edited after time is up.
 */
export function resolveFinalAnswers(input: {
  saved: AnswerMap
  submitted: AnswerMap | null | undefined
  deadlineAt: Date
  now: Date
}): { answers: AnswerMap; usedSubmitted: boolean } {
  if (input.submitted && acceptsAnswers(input.deadlineAt, input.now)) {
    return { answers: input.submitted, usedSubmitted: true }
  }
  return { answers: input.saved, usedSubmitted: false }
}

const isAnswerValue = (value: unknown): value is AnswerValue =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value)

/**
 * Keep only answers for real question indexes with a plain value, and cap their length.
 * Returns null when the input is not an object of answers at all.
 */
export function sanitizeAnswers(input: unknown, questionCount: number): AnswerMap | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const clean: AnswerMap = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^\d{1,4}$/.test(key)) continue
    if (Number(key) >= questionCount) continue
    if (!isAnswerValue(value)) continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    clean[key] = typeof value === 'string' ? value.slice(0, MAX_ANSWER_LENGTH) : value
  }
  return clean
}

/** The answers stored on an attempt, as an AnswerMap (anything unusable is dropped). */
export function readStoredAnswers(value: unknown): AnswerMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const clean: AnswerMap = {}
  for (const [key, answer] of Object.entries(value as Record<string, unknown>)) {
    if (isAnswerValue(answer)) clean[key] = answer
  }
  return clean
}
