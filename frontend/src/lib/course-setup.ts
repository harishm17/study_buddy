/**
 * Where a course is in setup. A course is "active" (the Today view) once it has confirmed
 * topics and at least one block of study content; before that it shows the setup guide.
 *
 *   step 1  add materials
 *   step 2  check the topics (also while topics are still being found)
 *   step 3  build study content
 */

export type CourseSetupInput = {
  status: string
  materialCount: number
  topicCount: number
  confirmedTopicCount: number
  contentBlockCount: number
}

export type CourseSetup =
  | { mode: 'active'; step: null; label: null }
  | { mode: 'setup'; step: 1 | 2 | 3; label: string }

export function deriveSetup(input: CourseSetupInput): CourseSetup {
  if (input.materialCount === 0) return { mode: 'setup', step: 1, label: 'Upload materials' }

  const topicsConfirmed =
    input.status !== 'setup' &&
    input.status !== 'topics_pending' &&
    input.topicCount > 0 &&
    input.confirmedTopicCount === input.topicCount

  if (!topicsConfirmed) {
    return {
      mode: 'setup',
      step: 2,
      label: input.topicCount === 0 ? 'Finding topics' : 'Review topics',
    }
  }
  if (input.contentBlockCount === 0) return { mode: 'setup', step: 3, label: 'Build study content' }
  return { mode: 'active', step: null, label: null }
}
