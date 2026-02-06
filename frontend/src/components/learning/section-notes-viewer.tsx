'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { CheckCircle, BookOpen, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SectionNotesViewerProps {
  content: string
  metadata: {
    citations?: Array<{
      filename: string
      category: string
      pages: string
    }>
    chunk_count?: number
  }
  topicId: string
  userId: string
  isCompleted: boolean
}

const normalizeMarkdownForDisplay = (rawContent: string): string => {
  let text = (rawContent || '').replace(/\r\n/g, '\n').trim()
  if (!text) return ''

  // Strip noisy inline citation tags; source files are listed separately below.
  text = text.replace(/\s*\[Citation:[^\]]+\]\s*/gi, ' ')
  text = text.replace(/^\s*If you want, I can:.*$/gim, '')

  const headingLabels = [
    'Overview',
    'Key Concepts',
    'How It Works',
    'Detailed Content',
    'Common Pitfalls',
    'Summary',
    'Exam-Ready Recap',
  ]

  for (const label of headingLabels) {
    const pattern = new RegExp(`^(?!#)\\s*${label}\\s*$`, 'gim')
    text = text.replace(pattern, `## ${label}`)
  }

  text = text.replace(/^\s*\d+\)\s+(.+)$/gim, '### $1')
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

export function SectionNotesViewer({
  content,
  metadata,
  topicId,
  userId,
  isCompleted,
}: SectionNotesViewerProps) {
  const router = useRouter()
  const [markingComplete, setMarkingComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const normalizedContent = useMemo(() => normalizeMarkdownForDisplay(content), [content])
  const readingMinutes = useMemo(() => {
    const wordCount = normalizedContent.split(/\s+/).filter(Boolean).length
    if (wordCount === 0) return 0
    return Math.max(1, Math.round(wordCount / 190))
  }, [normalizedContent])

  const handleMarkComplete = async () => {
    try {
      setMarkingComplete(true)
      setError(null)

      const response = await fetch(`/api/topics/${topicId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notesCompleted: true,
        }),
      })

      if (!response.ok) throw new Error('Failed to update progress')

      // Refresh page to update completion status
      router.refresh()
    } catch (error) {
      console.error('Error marking complete:', error)
      setError('Failed to update progress')
    } finally {
      setMarkingComplete(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <BookOpen className="h-6 w-6 text-primary" />
                <CardTitle>Section Notes</CardTitle>
                {isCompleted && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Completed
                  </Badge>
                )}
              </div>
              <CardDescription>
                Comprehensive study notes synthesized from your course materials
              </CardDescription>
            </div>

            {!isCompleted && (
              <Button
                onClick={handleMarkComplete}
                disabled={markingComplete}
                size="lg"
              >
                {markingComplete ? 'Marking...' : 'Mark as Complete'}
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Notes Content */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Badge variant="outline">Estimated reading: {readingMinutes} min</Badge>
            <Badge variant="outline">{metadata.chunk_count || 'Multiple'} source chunks</Badge>
          </div>
          <article className="markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '')
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  )
                },
              }}
            >
              {normalizedContent}
            </ReactMarkdown>
          </article>
        </CardContent>
      </Card>

      {/* Citations */}
      {metadata.citations && metadata.citations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Source Materials</CardTitle>
            </div>
            <CardDescription>
              These notes were synthesized from {metadata.chunk_count || 'multiple'}{' '}
              sections across the following materials:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metadata.citations.map((citation, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-white/70 p-3"
                >
                  <div>
                    <div className="font-medium">{citation.filename}</div>
                    <div className="text-sm text-muted-foreground">
                      Pages {citation.pages}
                    </div>
                  </div>
                  <Badge variant="outline">{citation.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Study Tips */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <BookOpen className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Study Tips</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Take your time reading through each section</li>
                <li>Pay special attention to highlighted key concepts and definitions</li>
                <li>Try to understand the examples before moving to practice problems</li>
                <li>Review the source citations if you need more detail on any topic</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
