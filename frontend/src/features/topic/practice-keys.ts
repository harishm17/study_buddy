import type { PracticeProblem } from './types'

/** Practice step keys and progress parsing: plain functions, usable on the server and in the browser. */

export type PracticeProgress = { solved: string[]; revealed: string[] }

export const EMPTY: PracticeProgress = { solved: [], revealed: [] }
export const practiceStepKey = (problemIndex: number, title: string, stepIndex: number): string =>
  `${problemIndex}|${title}|${stepIndex}`

/** Every step key of the current practice content, in order. */
export function practiceKeys(problems: PracticeProblem[] | undefined): string[] {
  return (problems ?? []).flatMap((problem, problemIndex) =>
    problem.steps.map((_step, stepIndex) => practiceStepKey(problemIndex, problem.title, stepIndex))
  )
}

export function parseProgress(raw: string | null | undefined): PracticeProgress {
  if (!raw) return EMPTY
  try {
    const value = JSON.parse(raw) as Partial<PracticeProgress>
    const strings = (list: unknown) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [])
    return { solved: strings(value.solved), revealed: strings(value.revealed) }
  } catch {
    return EMPTY
  }
}

export function solvedCount(progress: PracticeProgress, keys: string[]): number {
  const solved = new Set(progress.solved)
  return keys.filter((key) => solved.has(key)).length
}

/** At least this share of the steps solved counts the practice as done. */
export const PRACTICE_DONE_SHARE = 0.8

