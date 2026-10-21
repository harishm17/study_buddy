'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InlineAlert } from '@/components/ui/inline-alert'
import { ProgressRing } from '@/components/ui/progress-ring'
import type { VoiceAlert } from './errors'
import { clip, minutesLabel } from './format'
import type { EndReason, SessionSummary } from './session-state'

type SummaryProps = {
  summary: SessionSummary
  reason: EndReason | null
  alert: VoiceAlert | null
  back: { href: string; label: string }
  onRestart: () => void
}

const REASON_NOTE: Partial<Record<EndReason, string>> = {
  idle: 'The session ended because it was quiet for a while.',
  ended: 'This session had already ended.',
}

export function Summary({ summary, reason, alert, back, onRestart }: SummaryProps) {
  const quiz = summary.answered > 0
  const note = reason ? REASON_NOTE[reason] : undefined
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  React.useEffect(() => headingRef.current?.focus(), [])

  return (
    <div className="flex max-w-[560px] flex-col gap-4" data-testid="voice-summary">
      {alert ? (
        <InlineAlert tone={alert.tone} title={alert.title}>
          {alert.text}
        </InlineAlert>
      ) : note ? (
        <InlineAlert tone="neutral">{note}</InlineAlert>
      ) : null}

      <Card>
        <h2 ref={headingRef} tabIndex={-1} className="text-heading text-fg outline-none">
          {quiz ? 'Review finished' : 'Conversation finished'}
        </h2>
        <p className="mt-1 text-small text-fg-2">
          {quiz
            ? `You talked for ${minutesLabel(summary.minutes)}.`
            : `You talked for ${minutesLabel(summary.minutes)} and sent ${summary.exchanges} ${summary.exchanges === 1 ? 'message' : 'messages'}.`}
        </p>

        {quiz ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
            <ProgressRing
              size={96}
              value={summary.score}
              label={summary.score === null ? undefined : `${Math.round(summary.score * 100)}%`}
              aria-label={summary.score === null ? 'Not graded' : `${Math.round(summary.score * 100)} percent correct`}
            />
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Questions answered" value={summary.answered} testId="voice-stat-answered" />
              <Stat label="Correct" value={summary.correct} testId="voice-stat-correct" />
              {summary.partly > 0 ? <Stat label="Partly right" value={summary.partly} /> : null}
            </dl>
          </div>
        ) : null}

        {quiz ? (
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="text-subheading text-fg">Questions to revisit</h3>
            {summary.revisit.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-2" data-testid="voice-revisit">
                {summary.revisit.slice(0, 6).map((question) => (
                  <li key={question} className="text-small text-fg-2">
                    {clip(question)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-small text-fg-2">Every answer was right. Nothing to revisit.</p>
            )}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<ArrowCounterClockwise />} onClick={onRestart}>
            Start again
          </Button>
          <Button asChild variant="secondary">
            <Link href={back.href}>{back.label}</Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Stat({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div>
      <dt className="text-small text-fg-2">{label}</dt>
      <dd className="tabular text-heading text-fg" data-testid={testId}>
        {value}
      </dd>
    </div>
  )
}
