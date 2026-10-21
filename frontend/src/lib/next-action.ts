import type { NextAction } from '@/lib/learning/planner'

export type DescribedAction = {
  title: string
  reason: string
  /** The button label. */
  verb: string
  href: string
  etaLabel: string
  /** True for the batch "generate missing content" action, which runs in place on the course page. */
  isBatchGenerate: boolean
  /** True while the batch generation is already running. */
  isGenerating: boolean
}

/**
 * Turns a planner action into the words, button and link the UI shows. The planner's own
 * titles are written for logs and the old UI; this is the new product copy.
 */
export function describeNextAction(
  action: NextAction,
  courseId: string,
  topicName?: string | null
): DescribedAction {
  const base = `/courses/${courseId}`
  const topic = topicName?.trim() || 'this topic'
  const topicHref = (view?: string) =>
    action.topicId ? `${base}/topics/${action.topicId}${view ? `?view=${view}` : ''}` : `${base}/topics`
  const etaLabel = `About ${action.etaMinutes} min`
  const batch = action.id.includes('-batch')
  const common = { etaLabel, isBatchGenerate: false, isGenerating: false }

  switch (action.type) {
    case 'upload_materials':
      return {
        ...common,
        title: 'Add your materials',
        reason: 'Upload lecture notes, past exams or book chapters to get started.',
        verb: 'Upload',
        href: `${base}/materials`,
      }
    case 'extract_topics':
      return {
        ...common,
        title: 'Find the topics in your files',
        reason: 'Margins reads your materials and suggests a topic list.',
        verb: 'Find topics',
        href: `${base}/topics?edit=1`,
      }
    case 'confirm_topics':
      return {
        ...common,
        title: 'Check the topics',
        reason: 'Rename, merge or remove any, then confirm the list.',
        verb: 'Review topics',
        href: `${base}/topics?edit=1`,
      }
    case 'study_topic':
      return {
        ...common,
        title: `Study ${topic}`,
        reason: "You haven't finished the notes and examples yet.",
        verb: 'Start',
        href: topicHref('notes'),
      }
    case 'review_topic': {
      const due = /Review (\d+) due topics/.exec(action.title)?.[1]
      return {
        ...common,
        title: `Review ${topic}`,
        reason: due ? `${due} topics are due for review.` : 'Due for review.',
        verb: 'Review',
        href: topicHref('quiz'),
      }
    }
    case 'take_quiz':
      return {
        ...common,
        title: `Take the ${topic} quiz`,
        reason: 'A quiz shows what you remember and updates your review schedule.',
        verb: 'Take quiz',
        href: topicHref('quiz'),
      }
    case 'voice_drill':
      return {
        ...common,
        title: `Voice review: ${topic}`,
        reason: 'Explaining it out loud is the quickest way to find gaps.',
        verb: 'Start',
        href: topicHref('voice'),
      }
    case 'generate_content': {
      const generating = action.id.endsWith('-batch-active')
      return {
        ...common,
        title: generating
          ? 'Writing your study content'
          : batch
            ? 'Build the missing study content'
            : `Write content for ${topic}`,
        reason: generating
          ? 'It keeps running if you leave this page.'
          : batch
            ? 'Some topics are missing notes, examples, practice or a quiz.'
            : 'This topic is missing some notes, examples, practice or a quiz.',
        verb: generating ? 'View' : 'Generate',
        href: batch || !action.topicId ? base : topicHref(),
        isBatchGenerate: batch && !generating,
        isGenerating: generating,
      }
    }
    case 'take_exam': {
      const build = action.id.endsWith('-exam-build')
      return {
        ...common,
        title: build ? 'Create a mock exam' : 'Take a mock exam',
        reason: build
          ? "You're caught up on topics. Test yourself under real conditions."
          : 'Timed, mixed-topic practice.',
        verb: build ? 'Create' : 'Start',
        href: build ? `${base}/exams/new` : `${base}/exams`,
      }
    }
  }
}
