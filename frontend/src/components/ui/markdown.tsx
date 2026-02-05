'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'

type MarkdownVariant = 'default' | 'compact'

interface MarkdownBlockProps {
  content?: string | null
  className?: string
  variant?: MarkdownVariant
}

interface MarkdownInlineProps {
  content?: string | null
  className?: string
}

const normalizeMarkdown = (content?: string | null) => {
  return (content ?? '').replace(/\r\n/g, '\n').trim()
}

const CODE_BLOCK_STYLE = vscDarkPlus

export function MarkdownBlock({
  content,
  className,
  variant = 'default',
}: MarkdownBlockProps) {
  const normalized = normalizeMarkdown(content)
  if (!normalized) return null

  return (
    <div
      className={cn(
        'markdown-content',
        variant === 'compact' && 'markdown-compact',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ inline, className: codeClassName, children, ...props }: any) {
            const match = /language-(\w+)/.exec(codeClassName || '')
            return !inline && match ? (
              <SyntaxHighlighter
                style={CODE_BLOCK_STYLE}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  )
}

export function MarkdownInline({ content, className }: MarkdownInlineProps) {
  const normalized = normalizeMarkdown(content)
  if (!normalized) return null

  return (
    <span className={cn(className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        disallowedElements={[
          'p',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'ul',
          'ol',
          'li',
          'blockquote',
          'pre',
          'hr',
          'table',
          'thead',
          'tbody',
          'tr',
          'td',
          'th',
          'img',
        ]}
        unwrapDisallowed
        components={{
          code({ children, ...props }: any) {
            return (
              <code
                className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            )
          },
          a({ children, ...props }: any) {
            return (
              <a className="underline underline-offset-4 hover:text-primary" {...props}>
                {children}
              </a>
            )
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </span>
  )
}
