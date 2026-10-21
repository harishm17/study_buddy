/**
 * A "Check yourself" item in the notes: a fenced block whose language is `check`.
 *
 *     ```check
 *     Q: What is the cost of one `push` on a stack of n items?
 *     A: $O(1)$, because only the top changes.
 *     ```
 *
 * The question starts at `Q:` and the answer at `A:`; either may run over several lines (and hold
 * markdown or math). Anything that does not read that way is left to render as an ordinary code block.
 */

export type CheckItem = { question: string; answer: string }

const LABEL = String.raw`(?:\*\*|__)?`
const QUESTION = new RegExp(String.raw`^\s*${LABEL}(?:Q|Question)\s*[:.]${LABEL}[ \t]*`, 'i')
const ANSWER = new RegExp(String.raw`^\s*${LABEL}(?:A|Answer)\s*[:.]${LABEL}[ \t]*`, 'i')

/** The question and answer in a check block's text, or null when it has no `Q:` line and `A:` line. */
export function parseCheckBlock(text: string): CheckItem | null {
  const lines = text.split(/\r?\n/)
  const first = lines.findIndex((line) => QUESTION.test(line))
  if (first === -1) return null
  if (lines.slice(0, first).some((line) => line.trim())) return null
  const split = lines.findIndex((line, index) => index > first && ANSWER.test(line))
  if (split === -1) return null

  const question = [lines[first].replace(QUESTION, ''), ...lines.slice(first + 1, split)].join('\n').trim()
  const answer = [lines[split].replace(ANSWER, ''), ...lines.slice(split + 1)].join('\n').trim()
  return question && answer ? { question, answer } : null
}
