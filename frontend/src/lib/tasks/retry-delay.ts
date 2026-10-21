/**
 * How long the dispatcher waits before it calls the AI service again after a transient failure.
 *
 * The service answers 503 with a Retry-After header when the model is rate limited or overloaded
 * (it carries the API's own wait). The wait is the longer of the exponential backoff and that
 * header, capped at two minutes.
 */
const MAX_DELAY_MS = 120_000

export function retryDelayMs(attempt: number, retryAfter: string | null | undefined, jitterMs = 0): number {
  const backoff = 250 * 2 ** (attempt - 1) + jitterMs
  const seconds = Number(retryAfter)
  const requested = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
  return Math.min(Math.max(backoff, requested), MAX_DELAY_MS)
}
