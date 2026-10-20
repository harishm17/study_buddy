/** Friendly text for the error codes the chat can fail with. */

export type ChatErrorInfo = { message: string; retryable: boolean; status: number }

const KNOWN: Record<string, ChatErrorInfo> = {
  LLM_DAILY_BUDGET: {
    message: "You've reached today's AI usage limit. It resets at midnight UTC.",
    retryable: false,
    status: 429,
  },
  RATE_LIMITED: { message: 'You are asking too fast. Wait a moment and try again.', retryable: true, status: 429 },
  LLM_NOT_CONFIGURED: {
    message: 'Chat is not set up on this server: no AI key is configured.',
    retryable: false,
    status: 503,
  },
  LLM_AUTH_FAILED: {
    message: 'The AI service rejected its credentials, so it cannot answer right now.',
    retryable: false,
    status: 503,
  },
  LLM_CREDIT_EXHAUSTED: {
    message: 'The AI account is out of credit, so it cannot answer right now.',
    retryable: false,
    status: 503,
  },
  LLM_REQUEST_REJECTED: { message: 'The AI service could not process that question.', retryable: false, status: 502 },
  LLM_REFUSED: {
    message: 'The model declined to answer that. Try rephrasing the question.',
    retryable: false,
    status: 502,
  },
  LLM_RATE_LIMITED: { message: 'The AI service is busy. Try again in a moment.', retryable: true, status: 503 },
  LLM_UNAVAILABLE: { message: 'The AI service is busy or unreachable. Try again in a moment.', retryable: true, status: 503 },
  LLM_BAD_OUTPUT: {
    message: 'The answer came back empty or cut off. Try a narrower question.',
    retryable: true,
    status: 502,
  },
  RETRIEVAL_FAILED: { message: 'Could not search your materials just now. Try again.', retryable: true, status: 503 },
  PROJECT_NOT_FOUND: { message: 'That project was not found.', retryable: false, status: 404 },
  CHAT_UNAVAILABLE: { message: 'The AI service is not reachable right now. Try again in a moment.', retryable: true, status: 503 },
  CHAT_INTERRUPTED: { message: 'The answer was interrupted before it finished. Try again.', retryable: true, status: 502 },
  CHAT_NOT_SAVED: { message: 'The answer could not be saved to this conversation. It is shown here only.', retryable: false, status: 500 },
  CHAT_FAILED: { message: 'The answer could not be written. Try again.', retryable: true, status: 502 },
}

const FALLBACK: ChatErrorInfo = { message: 'Something went wrong while answering. Try again.', retryable: true, status: 502 }

/**
 * The message to show for `code`. An unknown code gets a generic message: the text the AI
 * service sends can carry internal detail, so it is logged by the server and never shown.
 */
export function chatErrorMessage(code: string): ChatErrorInfo {
  return KNOWN[code] ?? FALLBACK
}
