import type { NextAction } from '@/lib/learning/planner'

export type DescribedAction = {
  title: string
  reason: string
  /** The button label. */
  verb: string
  href: string
  etaLabel: string
  /** True while content is being written in the background (the building panel shows it instead). */
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
  const common = { etaLabel, isGenerating: false }

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
      // The notes are written when the topic is opened, so starting is all it takes.
      return {
        ...common,
        title: action.started ? `Continue ${topic}` : `Start ${topic}`,
        reason: action.started
          ? "You haven't finished the notes and examples yet."
          : 'The notes are written when you open it.',
        verb: action.started ? 'Continue' : 'Start',
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
    case 'generate_content':
      // Only the "being written" notice is left (the planner no longer asks to generate).
      return {
        ...common,
        title: 'Writing your study content',
        reason: 'It keeps running if you leave this page.',
        verb: 'View',
        href: action.topicId ? topicHref() : base,
        isGenerating: true,
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
