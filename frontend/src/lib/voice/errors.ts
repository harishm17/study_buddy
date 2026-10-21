import { ALLOWANCE_TEMPLATE, fillResetTime } from '@/lib/budget/copy'

/** Friendly text for the error codes a voice turn can fail with. Safe to show to the student. */

export type VoiceErrorInfo = { message: string; retryable: boolean; status: number }

const KNOWN: Record<string, VoiceErrorInfo> = {
  LLM_DAILY_BUDGET: {
    message: ALLOWANCE_TEMPLATE,
    retryable: false,
    status: 429,
  },
  RATE_LIMITED: { message: 'You are talking too fast for the coach. Wait a moment and try again.', retryable: true, status: 429 },
  LLM_NOT_CONFIGURED: {
    message: 'The voice coach is not set up on this server: no AI key is configured.',
    retryable: false,
    status: 503,
  },
  LLM_AUTH_FAILED: {
    message: 'The AI service rejected its credentials, so the coach cannot reply right now.',
    retryable: false,
    status: 503,
  },
  LLM_CREDIT_EXHAUSTED: {
    message: 'The AI account is out of credit, so the coach cannot reply right now.',
    retryable: false,
    status: 503,
  },
  LLM_REQUEST_REJECTED: { message: 'The AI service could not process that. Try saying it differently.', retryable: false, status: 502 },
  LLM_REFUSED: {
    message: 'The coach declined to answer that. Try asking something else about the topic.',
    retryable: false,
    status: 502,
  },
  LLM_RATE_LIMITED: { message: 'The AI service is busy. Try again in a moment.', retryable: true, status: 503 },
  LLM_UNAVAILABLE: { message: 'The AI service is busy or unreachable. Try again in a moment.', retryable: true, status: 503 },
  LLM_BAD_OUTPUT: { message: 'The coach did not manage to reply. Try again.', retryable: true, status: 502 },
  PROJECT_NOT_FOUND: { message: 'That project was not found.', retryable: false, status: 404 },
  VOICE_UNAVAILABLE: { message: 'The voice coach is not reachable right now. Try again in a moment.', retryable: true, status: 503 },
  VOICE_INTERRUPTED: { message: 'The coach was interrupted before it finished. Try again.', retryable: true, status: 502 },
  VOICE_TURN_FAILED: { message: 'The coach could not reply. Try again.', retryable: true, status: 502 },
  VOICE_NOT_SAVED: { message: 'The conversation could not be saved. The coach may repeat itself.', retryable: true, status: 500 },
  TURN_IN_PROGRESS: { message: 'The coach is still answering. Wait for it to finish.', retryable: true, status: 409 },
  SESSION_ENDED: { message: 'This voice session has ended. Start a new session.', retryable: false, status: 409 },
  ACTIVE_SESSION: {
    message: 'Another voice session is already open. End it before starting a new one.',
    retryable: false,
    status: 409,
  },
  VOICE_DAILY_LIMIT: {
    message: 'You have used all of your voice minutes for the last 24 hours. Try again later.',
    retryable: false,
    status: 429,
  },
}

const FALLBACK: VoiceErrorInfo = { message: 'Something went wrong with the coach. Try again.', retryable: true, status: 502 }

/**
 * The message to show for `code`. An unknown code gets a generic message: the text the AI
 * service sends can carry internal detail, so it is logged by the server and never shown.
 */
export function voiceErrorMessage(code: string): VoiceErrorInfo {
  const info = KNOWN[code] ?? FALLBACK
  // See chatErrorMessage: the reset time is filled in by the browser.
  return typeof window === 'undefined' ? info : { ...info, message: fillResetTime(info.message) }
}
