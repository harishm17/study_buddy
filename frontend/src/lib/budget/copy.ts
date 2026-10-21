/**
 * What students are told when they have used the day's AI allowance. No dollar amounts ever
 * reach the page: the AI service keeps those in its logs and in the job's error message, and
 * the screens show this copy for the code LLM_DAILY_BUDGET instead.
 *
 * The allowance resets at midnight UTC. The time is shown in the student's own time zone, so it
 * is worked out in the browser. Text produced on the server (it cannot know the time zone) carries
 * RESET_TOKEN where the time goes; `fillResetTime` swaps it in once the text reaches the browser.
 */

export const RESET_TOKEN = '{reset}'

export const ALLOWANCE_USED = "You've used today's AI allowance."

/** The message as the server writes it: the time is still a token. */
export const ALLOWANCE_TEMPLATE = `${ALLOWANCE_USED} It resets ${RESET_TOKEN}.`

/** The next midnight UTC after `now`. */
export function nextResetUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

/**
 * "at 5:00 PM", or "tomorrow at 8:00 AM" when the reset falls on the next calendar day in the
 * given time zone (the browser's by default).
 */
export function resetPhrase(now: Date = new Date(), timeZone?: string): string {
  const reset = nextResetUtc(now)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(reset)
  const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone }).format(date)
  return day(reset) === day(now) ? `at ${time}` : `tomorrow at ${time}`
}

/** "You've used today's AI allowance. It resets at 5:00 PM." */
export function allowanceMessage(now: Date = new Date(), timeZone?: string): string {
  return fillResetTime(ALLOWANCE_TEMPLATE, now, timeZone)
}

/** Put the local reset time where a server-written message has RESET_TOKEN. */
export function fillResetTime(message: string, now: Date = new Date(), timeZone?: string): string {
  return message.includes(RESET_TOKEN) ? message.replace(RESET_TOKEN, resetPhrase(now, timeZone)) : message
}
