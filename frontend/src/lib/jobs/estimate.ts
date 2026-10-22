/**
 * How long a file usually takes to be read, from the jobs that already finished. Nothing here is
 * made up: the figure is the median of real durations, it is offered only when there are enough of
 * them to mean something, and it is worded as "usually", not as a promise. The pipeline reports
 * only phase changes (checked, read, indexed), never a percentage, so there is no percentage here.
 */

const MIN_SAMPLES = 5

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Whole seconds, rounded to the nearest 5 (the figure is a typical value, not a measurement). */
const roundSeconds = (seconds: number): number => (seconds < 10 ? Math.max(1, Math.round(seconds)) : Math.round(seconds / 5) * 5)

/**
 * The typical time, in seconds, for a pipeline made of steps run one after the other. Each step is a
 * list of finished durations in milliseconds. Null when any step has too few samples to go on.
 */
export function typicalPipelineSeconds(steps: number[][], minSamples = MIN_SAMPLES): number | null {
  let total = 0
  for (const durations of steps) {
    const usable = durations.filter((ms) => Number.isFinite(ms) && ms > 0)
    if (usable.length < minSamples) return null
    total += median(usable)
  }
  return roundSeconds(total / 1000)
}

/** "a few seconds", "about 20 seconds", "about a minute", "about 2 minutes". */
export function estimateWords(seconds: number): string {
  if (seconds < 10) return 'a few seconds'
  if (seconds < 45) return `about ${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  return minutes <= 1 ? 'about a minute' : `about ${minutes} minutes`
}
