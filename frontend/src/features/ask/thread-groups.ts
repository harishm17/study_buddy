/**
 * Conversations grouped for the thread list: Today, Last 7 days, Earlier. The groups use how
 * long ago a conversation was active (under 24 hours, under 7 days) rather than calendar days,
 * so the server and the browser agree whatever their time zones are.
 */

export type ThreadSummary = {
  id: string
  title: string | null
  updatedAt: string
}

export type ThreadGroup = {
  label: 'Today' | 'Last 7 days' | 'Earlier'
  threads: ThreadSummary[]
}

const DAY = 24 * 60 * 60 * 1000

export const UNTITLED_THREAD = 'New conversation'

export const threadTitle = (thread: Pick<ThreadSummary, 'title'>): string => thread.title?.trim() || UNTITLED_THREAD

/** Groups in display order, empty groups left out. Threads keep their order within a group. */
export function groupThreads(threads: readonly ThreadSummary[], now: number): ThreadGroup[] {
  const groups: ThreadGroup[] = [
    { label: 'Today', threads: [] },
    { label: 'Last 7 days', threads: [] },
    { label: 'Earlier', threads: [] },
  ]
  for (const thread of threads) {
    const age = now - new Date(thread.updatedAt).getTime()
    groups[age < DAY ? 0 : age < 7 * DAY ? 1 : 2].threads.push(thread)
  }
  return groups.filter((group) => group.threads.length > 0)
}
