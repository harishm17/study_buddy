'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { isPdf, sourceLabel, viewerUrl, type ChatSource } from '@/lib/chat/citations'

/** What the citation markers inside an answer need: its sources, and how to show an excerpt. */
type CitationContextValue = {
  sources: readonly ChatSource[]
  openExcerpt: (source: ChatSource) => void
}

export const CitationContext = createContext<CitationContextValue | null>(null)

/**
 * A link to a cited source. A PDF opens in a new tab at the cited page, so it works with
 * the keyboard, middle click and "copy link". Other files have no pages to open, so the
 * cited excerpt is shown in a dialog instead.
 */
export function SourceLink({
  source,
  className,
  children,
  ...rest
}: {
  source: ChatSource
  className?: string
  children: ReactNode
  'aria-label'?: string
}) {
  const context = useContext(CitationContext)
  const title = sourceLabel(source)
  if (isPdf(source.filename)) {
    return (
      <a
        href={viewerUrl(source)}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${title}`}
        className={className}
        {...rest}
      >
        {children}
      </a>
    )
  }
  return (
    <button
      type="button"
      onClick={() => context?.openExcerpt(source)}
      title={`Show the excerpt from ${title}`}
      className={className}
      {...rest}
    >
      {children}
    </button>
  )
}

/** The small numbered link the markdown renderer puts in the answer text. */
export function CitationMarker({ marker }: { marker: number }) {
  const context = useContext(CitationContext)
  const source = context?.sources.find((s) => s.marker === marker)
  if (!source) {
    return <sup className="mx-0.5 text-[0.7rem] text-muted-foreground">[{marker}]</sup>
  }
  return (
    <SourceLink
      source={source}
      aria-label={`Source ${marker}: ${sourceLabel(source)}`}
      className={cn(
        'mx-0.5 inline-flex h-[1.2rem] min-w-[1.2rem] items-center justify-center rounded-full',
        'bg-primary/10 px-1 align-super text-[0.7rem] font-semibold leading-none text-primary no-underline',
        'transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {marker}
    </SourceLink>
  )
}
