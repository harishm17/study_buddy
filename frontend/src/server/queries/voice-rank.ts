/**
 * Which topics a voice sprint covers. This is the selection `buildSprintQuestionSet` makes in
 * src/lib/voice/drill-pack.ts, kept here as pure code so the sprint page can say which topics
 * the coach will ask about. If the backend rule changes, change this with it.
 *
 * Rule: score = best quiz score (0 with no quiz yet); a topic with any of notes, examples or
 * quiz not completed counts 10 points lower; the lowest three win, ties keep the input order.
 */

export type RankableTopic = {
  id: string
  name: string
  progress: {
    quizScore: number | null
    quizCompleted: boolean
    notesCompleted: boolean
    examplesCompleted: boolean
  } | null
}

export const SPRINT_TOPIC_COUNT = 3

export function rankWeakestTopics<T extends RankableTopic>(topics: T[], limit = SPRINT_TOPIC_COUNT): T[] {
  return topics
    .map((topic, position) => {
      const progress = topic.progress
      const score = progress?.quizScore ?? 0
      const incomplete = !progress?.quizCompleted || !progress?.notesCompleted || !progress?.examplesCompleted
      return { topic, position, priority: incomplete ? score - 10 : score }
    })
    .sort((a, b) => a.priority - b.priority || a.position - b.position)
    .slice(0, limit)
    .map((entry) => entry.topic)
}

/** "Covers your 3 weakest topics: A, B and C." The count follows the list. */
export function describeSprintTopics(topics: { name: string }[]): string {
  const names = topics.map((topic) => topic.name)
  if (names.length === 0) return ''
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const what = names.length === 1 ? 'your weakest topic' : `your ${names.length} weakest topics`
  return `Covers ${what}: ${list}.`
}
