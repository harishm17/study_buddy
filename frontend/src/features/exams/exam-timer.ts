/** How the exam timer looks as time runs down. Pure. */

export const WARNING_SECONDS = 5 * 60
export const DANGER_SECONDS = 60
/** A time-left notice stays on screen for this long after the threshold is crossed. */
export const NOTICE_SECONDS = 15

export type TimerTone = 'normal' | 'warning' | 'danger'

export function timerTone(secondsLeft: number): TimerTone {
  if (secondsLeft <= DANGER_SECONDS) return 'danger'
  if (secondsLeft <= WARNING_SECONDS) return 'warning'
  return 'normal'
}

/** The notice to show right now: "5 minutes left" just after five minutes, "1 minute left" just after one. */
export function timeNotice(secondsLeft: number): { tone: 'warning' | 'danger'; text: string } | null {
  if (secondsLeft > 0 && secondsLeft <= DANGER_SECONDS && secondsLeft > DANGER_SECONDS - NOTICE_SECONDS) {
    return { tone: 'danger', text: '1 minute left. Your answers will be submitted when time runs out.' }
  }
  if (secondsLeft <= WARNING_SECONDS && secondsLeft > WARNING_SECONDS - NOTICE_SECONDS) {
    return { tone: 'warning', text: '5 minutes left.' }
  }
  return null
}

export type FlagState = { flags: number[]; position: number }

/** The stored flags and position of an attempt, tolerant of a missing or damaged value. */
export function parseFlagState(raw: string | null, questionCount: number): FlagState {
  const empty: FlagState = { flags: [], position: 0 }
  if (!raw) return empty
  try {
    const parsed = JSON.parse(raw) as { flags?: unknown; position?: unknown }
    const flags = Array.isArray(parsed.flags)
      ? [...new Set(parsed.flags.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < questionCount))]
      : []
    const position =
      typeof parsed.position === 'number' && Number.isInteger(parsed.position)
        ? Math.min(Math.max(parsed.position, 0), Math.max(questionCount - 1, 0))
        : 0
    return { flags, position }
  } catch {
    return empty
  }
}
