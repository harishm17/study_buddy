'use client'

import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

// One markdown pipeline for the whole app. It is loaded on demand, so pages that only show
// a little markdown do not pay for KaTeX and Prism up front. The server still renders it.
const MarkdownRenderer = dynamic(() => import('./markdown-renderer'), {
  loading: () => (
    <div
      className="h-16 animate-pulse rounded-lg bg-muted/60"
      role="status"
      aria-label="Loading content"
    />
  ),
})

const InlineMarkdownRenderer = dynamic(() => import('./markdown-renderer'), {
  loading: () => <span className="inline-block h-4 w-24 animate-pulse rounded bg-muted/60 align-middle" />,
})

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
      <MarkdownRenderer content={normalized} />
    </div>
  )
}

export function MarkdownInline({ content, className }: MarkdownInlineProps) {
  const normalized = normalizeMarkdown(content)
  if (!normalized) return null

  return (
    <span className={cn(className)}>
      <InlineMarkdownRenderer content={normalized} inline />
    </span>
  )
}
