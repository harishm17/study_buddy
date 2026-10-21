import type { PracticeStep } from './types'

/**
 * Checking a practice answer in the browser. The key is in the page payload by design, so this
 * is a convenience for the student, not a security boundary.
 *
 * An answer is right when, after trimming and ignoring case and spacing, it equals the correct
 * answer or any acceptable answer, or, for numeric steps, when its number is within 1% of the
 * correct number or of any acceptable number. Both routes are tried, so "four" and "4.02" can
 * each be right for the same step.
 */

export const NUMERIC_TOLERANCE = 0.01

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/^\$+|\$+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/, '')
    .trim()

const NUMBER_AT_START = /^[-+]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?/i
const FRACTION = /^([-+]?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/

/** The number a numeric answer stands for: "1,250", "9.8 m/s^2", "6.02e23" and "3/4" all parse. */
export function parseNumber(value: string): number | null {
  const text = value.trim().replace(/^\$+|\$+$/g, '').replace(/−/g, '-')
  const fraction = FRACTION.exec(text)
  if (fraction) {
    const bottom = Number(fraction[2])
    return bottom === 0 ? null : Number(fraction[1]) / bottom
  }
  const match = NUMBER_AT_START.exec(text)
  if (!match) return null
  const parsed = Number(match[0].replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

/** Within 1% of the target (or very close to it when the target is zero). */
export function withinTolerance(given: number, target: number): boolean {
  if (target === 0) return Math.abs(given) < 1e-9
  return Math.abs(given - target) <= Math.abs(target) * NUMERIC_TOLERANCE + 1e-12
}

const OPTION_LETTER = /^\(?([a-h])[).:]?(?:\s|$)/i

/** "B" and "b)" and "B. O(V + E)" all name option B. */
function optionLetter(value: string): string | null {
  const match = OPTION_LETTER.exec(value.trim())
  return match ? match[1].toLowerCase() : null
}

export function checkPracticeAnswer(
  step: Pick<PracticeStep, 'answerType' | 'correctAnswer' | 'acceptableAnswers'>,
  input: string
): boolean {
  const given = normalize(input)
  if (!given) return false

  const targets = [step.correctAnswer, ...step.acceptableAnswers]
  if (targets.some((target) => normalize(target) === given)) return true

  if (step.answerType === 'numeric') {
    const number = parseNumber(input)
    if (number !== null) {
      return targets.some((target) => {
        const wanted = parseNumber(target)
        return wanted !== null && withinTolerance(number, wanted)
      })
    }
  }

  if (step.answerType === 'multiple_choice') {
    const letter = optionLetter(input)
    // Only a bare letter or "B) text" counts, and the key has to name a letter the same way.
    if (letter) return targets.some((target) => optionLetter(target) === letter)
  }

  return false
}

const OPTION_LINE = /^\s*(?:[-*]\s*)?\(?([A-H])[).:]\s+(.+?)\s*$/

/**
 * Practice steps of type multiple_choice carry no options field; a model usually writes them as
 * lines such as "A) O(V)" in the question. Returns the question without those lines and the
 * options, or null when there are fewer than two (then the step is answered as text).
 */
export function splitChoices(question: string): { stem: string; options: { id: string; text: string }[] } | null {
  const lines = question.split('\n')
  const options: { id: string; text: string }[] = []
  const stem: string[] = []
  for (const line of lines) {
    const match = OPTION_LINE.exec(line)
    if (match) options.push({ id: match[1].toUpperCase(), text: match[2] })
    else stem.push(line)
  }
  if (options.length < 2) return null
  return { stem: stem.join('\n').trim(), options }
}
