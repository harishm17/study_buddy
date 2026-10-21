import { formatLearningMarkdown } from '@/lib/utils/learning-markdown'

const BARE_HEADINGS = [
  'Overview',
  "What You'll Learn",
  'The Idea',
  'Key Concepts',
  'Worked Example',
  'Check Yourself',
  'How It Works',
  'Detailed Content',
  'Common Pitfalls',
  'Summary',
  'Exam-Ready Recap',
]

const OFFER_LINE = /^\s*(?:[-*>]\s*)?(?:\*\*|_)?if you want,? i can\b/i
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/

/**
 * Notes as the page shows them: leftover "[Citation: ...]" tags and "If you want, I can..."
 * offers removed, bare section names promoted to headings, the leading title heading dropped
 * (the page has its own h1), and long unbroken prose split into paragraphs.
 */
export function cleanNotes(raw: string): string {
  let body = raw.replace(/\r\n/g, '\n')

  body = body.replace(/[ \t]*\[Citation:[^\]]*\]/gi, '')

  // Drop an offer line and the bullet list that follows it.
  const lines = body.split('\n')
  const kept: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (OFFER_LINE.test(lines[index])) {
      while (index + 1 < lines.length && LIST_ITEM.test(lines[index + 1])) index += 1
      continue
    }
    kept.push(lines[index])
  }
  body = kept.join('\n')

  for (const label of BARE_HEADINGS) {
    body = body.replace(new RegExp('^(?!#)[ \\t]*' + label + '[ \\t]*:?[ \\t]*$', 'gim'), (found) => '## ' + found.trim().replace(/:$/, '').trim())
  }

  body = body.replace(/^\s*#\s+[^\n]*\n+/, '')
  body = body.replace(/\n{3,}/g, '\n\n')
  return formatLearningMarkdown(body)
}

/** About 200 words a minute, never less than one minute. */
export function readMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length
  return words === 0 ? 0 : Math.max(1, Math.round(words / 200))
}
