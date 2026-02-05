/**
 * Lightweight markdown normalizer for LLM-generated learning content.
 *
 * The LLM prompts now explicitly require proper markdown (fenced code blocks,
 * line breaks, paragraphs).  This formatter is a safety net that:
 *  1. Converts escaped `\n` literals to real newlines
 *  2. Adds paragraph breaks to long, dense prose that lacks them
 *
 * It intentionally does NOT try to detect code heuristically — that was
 * fragile, C-specific, and caused false positives (prose rendered as code).
 */

const MARKDOWN_BLOCK_RE =
  /```|^\s*[-*+]\s+|^\s*\d+\.\s+|^\s*>\s+|^\s*#{1,6}\s+|^\s*\|.+\|\s*$/m

const toText = (value: unknown): string => {
  if (value == null) return ''
  return String(value)
}

const normalizeRaw = (value: unknown): string => {
  let text = toText(value).replace(/\r\n/g, '\n').trim()
  if (!text) return ''

  // Some generations return escaped newlines as literal "\n".
  if (!text.includes('\n') && text.includes('\\n')) {
    text = text.replace(/\\n/g, '\n')
  }

  return text.trim()
}

const addParagraphBreaks = (text: string): string => {
  if (MARKDOWN_BLOCK_RE.test(text)) return text
  if (text.includes('\n\n')) return text
  if (text.length < 220) return text
  return text.replace(/([.?!])\s+(?=[A-Z0-9])/g, '$1\n\n')
}

export function formatLearningMarkdown(value: unknown): string {
  const text = normalizeRaw(value)
  if (!text) return ''

  return addParagraphBreaks(text)
}
