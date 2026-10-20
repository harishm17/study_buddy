'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { MarkdownBlock } from '@/components/ui/markdown'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  insertCitationMarkers,
  isPdf,
  pageLabel,
  quoteForDisplay,
  sourceLabel,
  viewerUrl,
  type ChatSource,
  type CitationMark,
} from '@/lib/chat/citations'
import { CitationContext, SourceLink } from './citation-context'

/** The cited excerpt of a file that has no pages to open (DOCX, PPTX). */
function ExcerptDialog({ source, onClose }: { source: ChatSource | null; onClose: () => void }) {
  return (
    <Dialog open={source !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        {source && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words pr-6 text-base">{source.filename}</DialogTitle>
              <DialogDescription>
                {[source.section, pageLabel(source)].filter(Boolean).join(' · ') || 'Cited excerpt'}
              </DialogDescription>
            </DialogHeader>
            <blockquote className="mt-4 whitespace-pre-wrap rounded-lg border-l-4 border-primary/40 bg-muted/50 p-4 text-sm leading-relaxed">
              {quoteForDisplay(source.citedText) || 'No excerpt was saved for this source.'}
            </blockquote>
            <a
              href={viewerUrl(source)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Download {source.filename}
            </a>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SourceRow({ source }: { source: ChatSource }) {
  const [expanded, setExpanded] = useState(false)
  const quote = quoteForDisplay(source.citedText)
  const long = quote.length > 180
  return (
    <li id={`source-${source.marker}`} className="rounded-xl border border-border/70 bg-white/60 p-3">
      <SourceLink
        source={source}
        className="inline-flex max-w-full items-center gap-2 rounded-lg text-left text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1 text-xs font-semibold">
          {source.marker}
        </span>
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{sourceLabel(source)}</span>
        {isPdf(source.filename) && <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      </SourceLink>
      {quote && (
        <p className={`mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}>
          {quote}
        </p>
      )}
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </li>
  )
}

/** An answer: markdown with numbered citation markers, and the sources under it. */
export function AnswerView({
  text,
  marks,
  sources,
  showSources = true,
}: {
  text: string
  marks: readonly CitationMark[]
  sources: readonly ChatSource[]
  showSources?: boolean
}) {
  const [excerpt, setExcerpt] = useState<ChatSource | null>(null)
  const content = useMemo(() => insertCitationMarkers(text, marks), [text, marks])
  const contextValue = useMemo(() => ({ sources, openExcerpt: setExcerpt }), [sources])
  const ordered = useMemo(() => [...sources].sort((a, b) => a.marker - b.marker), [sources])

  return (
    <CitationContext.Provider value={contextValue}>
      <MarkdownBlock content={content} variant="compact" />
      {showSources && ordered.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</h4>
          <ol className="space-y-2" aria-label="Sources for this answer">
            {ordered.map((source) => (
              <SourceRow key={source.marker} source={source} />
            ))}
          </ol>
        </div>
      )}
      <ExcerptDialog source={excerpt} onClose={() => setExcerpt(null)} />
    </CitationContext.Provider>
  )
}
