'use client'

/**
 * The shared markdown renderer. It is heavy (react-markdown, remark and rehype plugins, KaTeX,
 * highlight.js), so import it through `lazy-markdown.tsx` (next/dynamic) rather than directly.
 * The KaTeX and code styles are imported here so they load with this chunk only.
 */

import 'katex/dist/katex.min.css'
import './markdown.css'

import * as React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import latex from 'highlight.js/lib/languages/latex'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import { Check, Copy } from '@phosphor-icons/react/dist/ssr'
import { formatLearningMarkdown } from '@/lib/utils/learning-markdown'
import { protectMathText } from '@/lib/utils/math-text'
import { createSlugger } from '@/lib/markdown-outline'
import { cn } from '@/lib/utils'

const LANGUAGES = { bash, c, cpp, go, java, javascript, json, latex, python, rust, sql, typescript }

const ALIASES = {
  bash: ['sh', 'shell', 'zsh'],
  cpp: ['c++', 'cc', 'hpp'],
  javascript: ['js', 'jsx'],
  python: ['py'],
  rust: ['rs'],
  latex: ['tex'],
  typescript: ['ts', 'tsx'],
}

type HastNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const textOf = (node: HastNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('')

/** Gives h1 to h6 an id built from their text, matching `extractOutline`. */
function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const slug = createSlugger()
    const walk = (node: HastNode) => {
      if (node.type === 'element' && node.tagName && /^h[1-6]$/.test(node.tagName)) {
        node.properties = { ...node.properties, id: slug(textOf(node)) }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [
  rehypeHeadingIds,
  [rehypeKatex, { throwOnError: false, strict: 'ignore' }],
  [
    rehypeHighlight,
    {
      languages: LANGUAGES,
      aliases: ALIASES,
      detect: false,
      plainText: ['text', 'txt', 'plain', 'plaintext', 'math'],
    },
  ],
] as NonNullable<React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']>

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const ref = React.useRef<HTMLPreElement>(null)
  const [copied, setCopied] = React.useState(false)

  const code = React.Children.toArray(children).find(React.isValidElement) as
    | React.ReactElement<{ className?: string }>
    | undefined
  const language = /language-([\w+-]+)/.exec(code?.props.className ?? '')?.[1]

  async function copy() {
    const text = ref.current?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be denied; nothing useful to show.
    }
  }

  return (
    <div className="md-code group/code">
      <div className="md-code-bar">
        <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy code'} className="md-code-copy">
          {copied ? <Check weight="bold" className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
        {language && language !== 'math' ? <span className="md-code-lang">{language}</span> : null}
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  )
}

type CitationRenderer = (marker: number) => React.ReactNode

function buildComponents(renderCitation?: CitationRenderer, inline = false): Components {
  return {
    a({ href, children, node: _node, ...props }) {
      const cite = href ? /^#cite-(\d+)$/.exec(href) : null
      if (cite && renderCitation) return <>{renderCitation(Number(cite[1]))}</>
      const external = !!href && /^https?:\/\//.test(href)
      return (
        <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props}>
          {children}
        </a>
      )
    },
    pre({ children }) {
      return <CodeBlock>{children}</CodeBlock>
    },
    table({ children }) {
      return (
        <div className="md-table">
          <table>{children}</table>
        </div>
      )
    },
    ...(inline ? { p: ({ children }) => <>{children}</> } : {}),
  }
}

type MarkdownProps = {
  children: string
  /** "reading" is 17px for notes and answers; "compact" is 14px for cards and feedback. */
  variant?: 'reading' | 'compact'
  /** Run the notes normaliser first (escaped newlines, dense prose). */
  learning?: boolean
  /** Renders `[n](#cite-n)` links. Chat passes this; the renderer knows nothing else about citations. */
  renderCitation?: CitationRenderer
  className?: string
}

export function Markdown({ children, variant = 'reading', learning, renderCitation, className }: MarkdownProps) {
  const source = protectMathText(learning ? formatLearningMarkdown(children) : children)
  const components = React.useMemo(() => buildComponents(renderCitation), [renderCitation])
  return (
    <div className={cn('md', variant === 'reading' ? 'md-reading' : 'md-compact', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}

const BLOCK_ELEMENTS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'img',
]

/** Inline-only markdown for question text and option labels: emphasis, code and math, no blocks. */
export function MarkdownInline({ children, className }: { children: string; className?: string }) {
  const components = React.useMemo(() => buildComponents(undefined, true), [])
  return (
    <span className={cn('md md-inline', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        disallowedElements={BLOCK_ELEMENTS}
        unwrapDisallowed
      >
        {protectMathText(children)}
      </ReactMarkdown>
    </span>
  )
}
