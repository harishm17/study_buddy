import type { PracticeProblem } from './types'

/** Practice step keys and progress parsing: plain functions, usable on the server and in the browser. */

/** Step keys the student solved, was shown the answer to, or took a hint on. */
export type PracticeProgress = { solved: string[]; revealed: string[]; hinted: string[] }

export const EMPTY: PracticeProgress = { solved: [], revealed: [], hinted: [] }
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
    return { solved: strings(value.solved), revealed: strings(value.revealed), hinted: strings(value.hinted) }
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

// ---------------------------------------------------------------------------------------
// Step keys and the server's per-problem rows

/** A key taken apart: "2|Title with | in it|1" is problem 2, that title, step 1. Null when it is not a key. */
export function parseStepKey(key: string): { problemIndex: number; title: string; stepIndex: number } | null {
  const first = key.indexOf('|')
  const last = key.lastIndexOf('|')
  if (first <= 0 || last <= first) return null
  const problemIndex = Number(key.slice(0, first))
  const stepIndex = Number(key.slice(last + 1))
  if (!Number.isInteger(problemIndex) || !Number.isInteger(stepIndex) || problemIndex < 0 || stepIndex < 0) return null
  return { problemIndex, title: key.slice(first + 1, last), stepIndex }
}

/** One problem's progress as the server stores it: step positions (0-based) by state. */
export type ProblemProgress = {
  problemIndex: number
  problemTitle: string
  solvedSteps: number[]
  revealedSteps: number[]
  hintedSteps: number[]
}

const sortedUnique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b)

/** Local progress grouped by problem (a problem is its position and title). */
export function groupProgress(progress: PracticeProgress): ProblemProgress[] {
  const groups = new Map<string, ProblemProgress>()
  const add = (keys: string[], field: 'solvedSteps' | 'revealedSteps' | 'hintedSteps') => {
    for (const key of keys) {
      const parsed = parseStepKey(key)
      if (!parsed) continue
      const id = `${parsed.problemIndex}|${parsed.title}`
      const group = groups.get(id) ?? {
        problemIndex: parsed.problemIndex,
        problemTitle: parsed.title,
        solvedSteps: [],
        revealedSteps: [],
        hintedSteps: [],
      }
      group[field].push(parsed.stepIndex)
      groups.set(id, group)
    }
  }
  add(progress.solved, 'solvedSteps')
  add(progress.revealed, 'revealedSteps')
  add(progress.hinted, 'hintedSteps')
  return [...groups.values()]
    .map((group) => ({
      ...group,
      solvedSteps: sortedUnique(group.solvedSteps),
      revealedSteps: sortedUnique(group.revealedSteps).filter((step) => !group.solvedSteps.includes(step)),
      hintedSteps: sortedUnique(group.hintedSteps),
    }))
    .sort((a, b) => a.problemIndex - b.problemIndex)
}

/** Server rows back into local keys. */
export function progressFromProblems(problems: ProblemProgress[]): PracticeProgress {
  const key = (problem: ProblemProgress, step: number) => practiceStepKey(problem.problemIndex, problem.problemTitle, step)
  return {
    solved: problems.flatMap((problem) => problem.solvedSteps.map((step) => key(problem, step))),
    revealed: problems.flatMap((problem) => problem.revealedSteps.map((step) => key(problem, step))),
    hinted: problems.flatMap((problem) => problem.hintedSteps.map((step) => key(problem, step))),
  }
}

const sameProblem = (a: { problemIndex: number; problemTitle: string }, b: { problemIndex: number; problemTitle: string }) =>
  a.problemIndex === b.problemIndex && a.problemTitle === b.problemTitle

/**
 * What a browser holds after loading: the server's rows are authoritative for the problems they cover
 * (another device may have worked on them, or started one over), and local progress is kept for
 * problems the server has no row for yet. `toUpload` lists those local-only problems, to be sent once.
 */
export function mergeServerProgress(
  local: PracticeProgress,
  server: ProblemProgress[]
): { merged: PracticeProgress; toUpload: ProblemProgress[] } {
  const localGroups = groupProgress(local)
  const localOnly = localGroups.filter((group) => !server.some((row) => row.problemIndex === group.problemIndex))
  // A server row for the same position but another title is an older rewrite: the local group is stale too.
  const staleLocal = localGroups.filter((group) => server.some((row) => row.problemIndex === group.problemIndex && !sameProblem(row, group)))
  const keep = localOnly.filter((group) => !staleLocal.includes(group))
  return { merged: progressFromProblems([...server, ...keep]), toUpload: keep }
}

/** Score of a finished problem: steps solved without a hint, over all its steps. */
export function problemScore(problem: Pick<ProblemProgress, 'solvedSteps' | 'hintedSteps'>, stepsTotal: number): number {
  if (stepsTotal <= 0) return 0
  const hinted = new Set(problem.hintedSteps)
  const clean = problem.solvedSteps.filter((step) => !hinted.has(step)).length
  return Math.min(1, clean / stepsTotal)
}

/** Every step is solved or shown. */
export function problemFinished(problem: Pick<ProblemProgress, 'solvedSteps' | 'revealedSteps'>, stepsTotal: number): boolean {
  if (stepsTotal <= 0) return false
  const closed = new Set([...problem.solvedSteps, ...problem.revealedSteps])
  return closed.size >= stepsTotal
}

/** Step positions cleaned for storage: whole numbers inside the problem, once each, solved over shown. */
export function cleanSteps(
  input: { solvedSteps: number[]; revealedSteps: number[]; hintedSteps: number[] },
  stepsTotal: number
): { solvedSteps: number[]; revealedSteps: number[]; hintedSteps: number[] } {
  const inside = (values: number[]) => sortedUnique(values.filter((value) => Number.isInteger(value) && value >= 0 && value < stepsTotal))
  const solvedSteps = inside(input.solvedSteps)
  return {
    solvedSteps,
    revealedSteps: inside(input.revealedSteps).filter((step) => !solvedSteps.includes(step)),
    hintedSteps: inside(input.hintedSteps),
  }
}

/** The union of two stored states of one problem (used when local progress is uploaded for the first time). */
export function unionSteps(
  a: { solvedSteps: number[]; revealedSteps: number[]; hintedSteps: number[] },
  b: { solvedSteps: number[]; revealedSteps: number[]; hintedSteps: number[] }
) {
  return {
    solvedSteps: sortedUnique([...a.solvedSteps, ...b.solvedSteps]),
    revealedSteps: sortedUnique([...a.revealedSteps, ...b.revealedSteps]),
    hintedSteps: sortedUnique([...a.hintedSteps, ...b.hintedSteps]),
  }
}
