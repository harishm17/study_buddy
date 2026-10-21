import type { ViewId } from './types'

/**
 * The view a topic opens on when the URL names none: the first one the student has not
 * finished (notes, then examples, then the quiz), or the notes when everything is done.
 * Practice is left out because its progress lives in the browser, where the server cannot see it.
 */
export function defaultView(progress: { notes: boolean; examples: boolean; quiz: boolean }): ViewId {
  if (!progress.notes) return 'notes'
  if (!progress.examples) return 'examples'
  if (!progress.quiz) return 'quiz'
  return 'notes'
}
