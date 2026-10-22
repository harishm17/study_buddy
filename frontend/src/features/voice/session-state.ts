/**
 * The UI state of a voice practice, as a pure reducer. The hook in use-voice-session.ts does the
 * imperative work (fetch, recognition, speech) and reports what happened here.
 */
import type { VoiceOption } from '@/lib/voice/turn-client'
import type { LobbyAlert, VoiceAlert } from './errors'
import type { VoiceStyle } from './voice-api'

export type Phase = 'lobby' | 'starting' | 'live' | 'summary'
export type InputMode = 'voice' | 'text'
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'paused'

/** Why the session is not open any more. */
export type EndReason = 'user' | 'complete' | 'idle' | 'ended' | 'error'

/** A standing note about the microphone or recognizer, shown above the controls. */
export type MicNotice = 'unsupported' | 'language' | 'denied' | 'no-mic' | 'network' | 'unstable'

export type Evaluation = {
  isCorrect: boolean
  score: number
  comment: string
  explanation: string
  ungraded: boolean
}

export type EvaluationTone = 'accent' | 'warning' | 'danger' | 'neutral'

/** The badge for an evaluation: Correct, Partly, Not quite, or Noted when there was no answer key. */
export function evaluationBadge(evaluation: Pick<Evaluation, 'isCorrect' | 'score' | 'ungraded'>): {
  label: string
  tone: EvaluationTone
} {
  if (evaluation.ungraded) return { label: 'Noted', tone: 'neutral' }
  if (evaluation.isCorrect) return { label: 'Correct', tone: 'accent' }
  if (evaluation.score >= 0.4) return { label: 'Partly', tone: 'warning' }
  return { label: 'Not quite', tone: 'danger' }
}

export type StudentEntry = { id: number; role: 'student'; text: string }
export type CoachEntry = {
  id: number
  role: 'coach'
  text: string
  streaming: boolean
  interrupted: boolean
  evaluation?: Evaluation
  hint?: string
}
export type TranscriptEntry = StudentEntry | CoachEntry

export type QuestionInfo = { index: number; total: number; text: string; options?: VoiceOption[] }

export type AnsweredQuestion = {
  text: string
  isCorrect: boolean
  score: number
  ungraded: boolean
}

export type SpeechOutput = 'on' | 'off' | 'unsupported'

export type SessionState = {
  phase: Phase
  /** The coaching style of the open session (a sprint is always oral_quiz). */
  style: VoiceStyle
  inputMode: InputMode
  micPaused: boolean
  speech: SpeechOutput
  /** Coach audio is playing. */
  speaking: boolean
  /** A turn request is open (the coach is working or streaming). */
  turnActive: boolean
  interim: string
  entries: TranscriptEntry[]
  question: QuestionInfo | null
  answered: AnsweredQuestion[]
  /** The coach said the drill is over; the summary follows when it stops talking. */
  complete: boolean
  alert: VoiceAlert | null
  micNotice: MicNotice | null
  lobbyAlert: LobbyAlert | null
  /** The daily limit was hit (the server said so), whatever the usage numbers say. */
  limitReached: boolean
  endReason: EndReason | null
  startedAt: number | null
  endedAt: number | null
  nextId: number
}

export const initialSessionState: SessionState = {
  phase: 'lobby',
  style: 'oral_quiz',
  inputMode: 'voice',
  micPaused: false,
  speech: 'on',
  speaking: false,
  turnActive: false,
  interim: '',
  entries: [],
  question: null,
  answered: [],
  complete: false,
  alert: null,
  micNotice: null,
  lobbyAlert: null,
  limitReached: false,
  endReason: null,
  startedAt: null,
  endedAt: null,
  nextId: 1,
}

export type SessionAction =
  | { type: 'starting' }
  | { type: 'start-failed'; lobbyAlert: LobbyAlert; limitReached?: boolean }
  | { type: 'started'; at: number; style: VoiceStyle; inputMode: InputMode; speech: SpeechOutput; micNotice: MicNotice | null }
  | { type: 'reset' }
  | { type: 'student-said'; text: string }
  | { type: 'turn-started' }
  | { type: 'coach-text'; delta: string }
  | { type: 'question'; question: QuestionInfo }
  | { type: 'evaluation'; evaluation: Evaluation }
  | { type: 'hint'; text: string }
  | { type: 'session-complete' }
  | { type: 'turn-done' }
  | { type: 'turn-failed'; alert: VoiceAlert }
  | { type: 'turn-aborted' }
  | { type: 'speaking'; on: boolean }
  | { type: 'interim'; text: string }
  | { type: 'mic-paused'; paused: boolean }
  | { type: 'input-mode'; mode: InputMode; micNotice?: MicNotice | null }
  | { type: 'speech'; output: SpeechOutput }
  | { type: 'mic-notice'; notice: MicNotice | null }
  | { type: 'dismiss-alert' }
  | { type: 'finish'; reason: EndReason; at: number; alert?: VoiceAlert | null }

/** The newest coach entry if it is still being written. */
function openCoachIndex(entries: TranscriptEntry[]): number {
  const last = entries.length - 1
  const entry = entries[last]
  return entry && entry.role === 'coach' && entry.streaming ? last : -1
}

function patchOpenCoach(state: SessionState, patch: (entry: CoachEntry) => CoachEntry): SessionState {
  const index = openCoachIndex(state.entries)
  if (index >= 0) {
    const entries = state.entries.slice()
    entries[index] = patch(entries[index] as CoachEntry)
    return { ...state, entries }
  }
  // Events outside a turn (should not happen): start a coach entry rather than lose them.
  const entry = patch({ id: state.nextId, role: 'coach', text: '', streaming: true, interrupted: false })
  return { ...state, entries: [...state.entries, entry], nextId: state.nextId + 1 }
}

function closeCoach(entries: TranscriptEntry[], interrupted: boolean): TranscriptEntry[] {
  const index = openCoachIndex(entries)
  if (index < 0) return entries
  const next = entries.slice()
  const entry = next[index] as CoachEntry
  const hasContent = entry.text.trim() !== '' || !!entry.evaluation || !!entry.hint
  if (!hasContent) {
    next.splice(index, 1)
    return next
  }
  next[index] = { ...entry, streaming: false, interrupted: interrupted && entry.text.trim() !== '' }
  return next
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'starting':
      return { ...state, phase: 'starting', lobbyAlert: null }

    case 'start-failed':
      return {
        ...initialSessionState,
        lobbyAlert: action.lobbyAlert,
        limitReached: action.limitReached ?? state.limitReached,
      }

    case 'started':
      return {
        ...initialSessionState,
        phase: 'live',
        style: action.style,
        startedAt: action.at,
        inputMode: action.inputMode,
        speech: action.speech,
        micNotice: action.micNotice,
        limitReached: state.limitReached,
      }

    case 'reset':
      return { ...initialSessionState, limitReached: state.limitReached }

    case 'student-said':
      return {
        ...state,
        alert: null,
        interim: '',
        entries: [...state.entries, { id: state.nextId, role: 'student', text: action.text }],
        nextId: state.nextId + 1,
      }

    case 'turn-started':
      return {
        ...state,
        alert: null,
        turnActive: true,
        entries: [
          ...closeCoach(state.entries, false),
          { id: state.nextId, role: 'coach', text: '', streaming: true, interrupted: false },
        ],
        nextId: state.nextId + 1,
      }

    case 'coach-text':
      return patchOpenCoach(state, (entry) => ({ ...entry, text: entry.text + action.delta }))

    case 'question':
      return { ...state, question: action.question }

    case 'evaluation': {
      const next = patchOpenCoach(state, (entry) => ({ ...entry, evaluation: action.evaluation }))
      return {
        ...next,
        answered: [
          ...next.answered,
          {
            text: state.question?.text ?? 'A question',
            isCorrect: action.evaluation.isCorrect,
            score: action.evaluation.score,
            ungraded: action.evaluation.ungraded,
          },
        ],
      }
    }

    case 'hint':
      return patchOpenCoach(state, (entry) => ({ ...entry, hint: action.text }))

    case 'session-complete':
      return { ...state, complete: true }

    case 'turn-done':
      return { ...state, turnActive: false, entries: closeCoach(state.entries, false) }

    case 'turn-failed':
      return { ...state, turnActive: false, alert: action.alert, entries: closeCoach(state.entries, false) }

    case 'turn-aborted':
      return { ...state, turnActive: false, speaking: false, entries: closeCoach(state.entries, true) }

    case 'speaking':
      return state.speaking === action.on ? state : { ...state, speaking: action.on }

    case 'interim':
      return state.interim === action.text ? state : { ...state, interim: action.text }

    case 'mic-paused':
      return { ...state, micPaused: action.paused, interim: action.paused ? '' : state.interim }

    case 'input-mode':
      return {
        ...state,
        inputMode: action.mode,
        micPaused: false,
        interim: '',
        micNotice: action.micNotice === undefined ? (action.mode === 'voice' ? null : state.micNotice) : action.micNotice,
      }

    case 'speech':
      return { ...state, speech: action.output, speaking: action.output === 'on' ? state.speaking : false }

    case 'mic-notice':
      return { ...state, micNotice: action.notice }

    case 'dismiss-alert':
      return { ...state, alert: null }

    case 'finish':
      return {
        ...state,
        phase: 'summary',
        endReason: action.reason,
        endedAt: action.at,
        turnActive: false,
        speaking: false,
        interim: '',
        alert: action.alert ?? null,
        entries: closeCoach(state.entries, false),
      }

    default:
      return state
  }
}

/** The orb shows one state; speaking and thinking win over the mic state. */
export function deriveOrbState(
  state: Pick<SessionState, 'phase' | 'inputMode' | 'micPaused' | 'speaking' | 'turnActive'>
): OrbState {
  if (state.phase !== 'live') return 'idle'
  if (state.speaking) return 'speaking'
  if (state.turnActive) return 'thinking'
  if (state.inputMode === 'text') return 'idle'
  return state.micPaused ? 'paused' : 'listening'
}

export const ORB_LABEL: Record<OrbState, string> = {
  idle: 'Your turn',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  paused: 'Paused',
}

export type SessionSummary = {
  answered: number
  correct: number
  partly: number
  /** 0..1 of graded answers that were correct, null when nothing was graded. */
  score: number | null
  revisit: string[]
  minutes: number
  exchanges: number
}

export function summarize(state: Pick<SessionState, 'answered' | 'entries' | 'startedAt' | 'endedAt'>): SessionSummary {
  const graded = state.answered.filter((item) => !item.ungraded)
  const correct = graded.filter((item) => item.isCorrect).length
  const partly = graded.filter((item) => !item.isCorrect && item.score >= 0.4).length
  const revisit = graded.filter((item) => !item.isCorrect).map((item) => item.text)
  const seconds = state.startedAt && state.endedAt ? Math.max(0, (state.endedAt - state.startedAt) / 1000) : 0
  return {
    answered: state.answered.length,
    correct,
    partly,
    score: graded.length > 0 ? correct / graded.length : null,
    revisit: [...new Set(revisit)],
    minutes: Math.max(1, Math.round(seconds / 60)),
    exchanges: state.entries.filter((entry) => entry.role === 'student').length,
  }
}
