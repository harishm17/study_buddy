import * as React from 'react'
import { LazyMarkdown } from './lazy-markdown'
import { MathText } from './math-text'

/** A stem with a line break holds more than one block: a paragraph break, a table or a code block. */
export const stemHasBlocks = (text: string): boolean => /\n/.test(text.trim())

/**
 * A question stem as the model wrote it. One line is inline text with math. Anything longer (a
 * table of values, a code listing, a second paragraph) goes through the block renderer, so a table
 * stays a table instead of flattening into one run-on line. The block form is a `div`; the inline
 * form is a fragment, so the caller picks the element that holds it (a heading, a paragraph).
 */
export function QuestionText({ children, className }: { children: string; className?: string }) {
  if (!stemHasBlocks(children)) return <MathText className={className}>{children}</MathText>
  return (
    <LazyMarkdown variant="stem" className={className}>
      {children}
    </LazyMarkdown>
  )
}
