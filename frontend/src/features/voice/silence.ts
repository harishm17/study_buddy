/**
 * Turns the speech recognizer's running result list into whole utterances.
 *
 * Pure logic (timers are injected) so it can be tested without a browser. The recognizer
 * (continuous, interim results) reports every result so far; a result is "final" once the
 * recognizer is sure of it. We treat the utterance as finished when everything pending is
 * final and `silenceMs` passes with no new result. If a result stays interim for a long time
 * (some browsers never finalise the last phrase) `staleInterimMs` commits it anyway.
 */

export type SpeechResult = { transcript: string; isFinal: boolean }

export type Timers = {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

export const SILENCE_MS = 800
export const STALE_INTERIM_MS = 2500
/** Shorter than this (after trimming) is noise ("uh", a click) and is dropped. */
export const MIN_UTTERANCE_CHARS = 2

const browserTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function joinTranscripts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Something a person could have said: at least one letter or digit, and long enough. */
export function isSpeakable(text: string, minChars = MIN_UTTERANCE_CHARS): boolean {
  const trimmed = text.trim()
  return trimmed.length >= minChars && /[\p{L}\p{N}]/u.test(trimmed)
}

export type UtteranceCollectorOptions = {
  silenceMs?: number
  staleInterimMs?: number
  minChars?: number
  timers?: Timers
  /** A finished utterance, the joined final segments. */
  onCommit: (text: string) => void
  /** The words heard so far and not yet committed (final and interim together). */
  onInterim?: (text: string) => void
}

export type UtteranceCollector = {
  /** Feed the full result list of the current recognition run. */
  update: (results: SpeechResult[]) => void
  /** The text of `results` that has not been committed or skipped yet. */
  peek: (results: SpeechResult[]) => string
  /** Forget everything heard so far (echo of the coach, or the mic was paused). */
  skip: (results: SpeechResult[]) => void
  /** Commit what is pending now, without waiting for silence. */
  flush: () => void
  /** The recognizer restarted: its result list starts again from zero. */
  reset: () => void
  dispose: () => void
}

export function createUtteranceCollector(options: UtteranceCollectorOptions): UtteranceCollector {
  const silenceMs = options.silenceMs ?? SILENCE_MS
  const staleInterimMs = options.staleInterimMs ?? STALE_INTERIM_MS
  const minChars = options.minChars ?? MIN_UTTERANCE_CHARS
  const timers = options.timers ?? browserTimers

  let consumed = 0
  let lastLength = 0
  let pending: SpeechResult[] = []
  let timer: unknown = null

  const clearTimer = () => {
    if (timer !== null) timers.clear(timer)
    timer = null
  }

  const pendingOf = (results: SpeechResult[]) => results.slice(Math.min(consumed, results.length))

  const commit = () => {
    clearTimer()
    const text = joinTranscripts(pending.map((result) => result.transcript))
    consumed = lastLength
    pending = []
    options.onInterim?.('')
    if (isSpeakable(text, minChars)) options.onCommit(text)
  }

  return {
    update(results) {
      lastLength = results.length
      pending = pendingOf(results)
      clearTimer()
      const text = joinTranscripts(pending.map((result) => result.transcript))
      options.onInterim?.(text)
      if (!text) return
      const waitingOnRecognizer = pending.some((result) => !result.isFinal)
      timer = timers.set(commit, waitingOnRecognizer ? staleInterimMs : silenceMs)
    },
    peek(results) {
      return joinTranscripts(pendingOf(results).map((result) => result.transcript))
    },
    skip(results) {
      clearTimer()
      consumed = results.length
      lastLength = results.length
      pending = []
      options.onInterim?.('')
    },
    flush() {
      if (pending.length > 0) commit()
      else clearTimer()
    },
    reset() {
      clearTimer()
      consumed = 0
      lastLength = 0
      pending = []
      options.onInterim?.('')
    },
    dispose() {
      clearTimer()
    },
  }
}

// ---- Echo --------------------------------------------------------------------------------

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/**
 * True when what the recognizer heard is (mostly) the coach's own voice coming back through
 * the speakers, so it must not count as the student talking over the coach.
 */
export function isEcho(heard: string, spoken: string): boolean {
  const heardWords = words(heard)
  const spokenWords = words(spoken)
  if (heardWords.length === 0 || spokenWords.length === 0) return false

  const heardJoined = ` ${heardWords.join(' ')} `
  const spokenJoined = ` ${spokenWords.join(' ')} `
  if (spokenJoined.includes(heardJoined)) return true

  if (heardWords.length < 3) return false
  const spokenSet = new Set(spokenWords)
  const matching = heardWords.filter((word) => spokenSet.has(word)).length
  return matching / heardWords.length >= 0.8
}

// ---- Idle --------------------------------------------------------------------------------

export type IdleAction = 'none' | 'nudge' | 'end'

export const VOICE_NUDGE_MS = 45_000
export const VOICE_END_AFTER_NUDGE_MS = 75_000
export const TEXT_END_MS = 10 * 60_000

/**
 * What to do when the student has been silent for `idleMs` since the coach last finished:
 * ask the coach to nudge once, then end the session; a typing student gets a long wait.
 */
export function idleAction(input: { inputMode: 'voice' | 'text'; idleMs: number; nudged: boolean }): IdleAction {
  if (input.inputMode === 'text') return input.idleMs >= TEXT_END_MS ? 'end' : 'none'
  if (input.nudged) return input.idleMs >= VOICE_END_AFTER_NUDGE_MS ? 'end' : 'none'
  return input.idleMs >= VOICE_NUDGE_MS ? 'nudge' : 'none'
}
