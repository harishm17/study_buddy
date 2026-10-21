import * as React from 'react'
import { LazyMarkdownInline } from './lazy-markdown'

// Anything inline markdown or math would change: math, escapes, emphasis, code, links, html, entities.
const NEEDS_MARKDOWN = /[$\\*_`~[\]<&]/

/**
 * A model-written string in running text: titles, chips, options, hints, feedback, explanations.
 * Renders inline markdown and KaTeX through the lazy inline renderer (no block elements), and
 * plain strings straight away so the renderer's chunk only loads where there is something to
 * format. Longer passages with lists, headings or code use `LazyMarkdown` instead.
 */
export function MathText({ children, className }: { children: string; className?: string }) {
  if (!NEEDS_MARKDOWN.test(children)) return className ? <span className={className}>{children}</span> : <>{children}</>
  return <LazyMarkdownInline className={className}>{children}</LazyMarkdownInline>
}
