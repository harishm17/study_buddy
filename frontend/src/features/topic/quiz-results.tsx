'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowCounterClockwise, Microphone } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { toast } from '@/components/ui/toaster'
import { apiFetch } from '@/lib/api/client'
import type { PublicQuizQuestion } from '@/lib/learning/quiz-questions'
import type { QuizReviewItem } from '@/lib/learning/quiz-review'
import { cn } from '@/lib/utils'
import { buildEntries, ReviewList } from './quiz-review-list'

export type QuizResult = {
  score: number
  earnedPoints: number
  totalPoints: number
  bestScore: number
  review: QuizReviewItem[]
  answers: Record<string, string>
}

const points = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

const CONFIDENCE_LABELS = ['Guessing', 'Unsure', 'Okay', 'Fairly sure', 'Certain']

function ConfidencePrompt({ topicId }: { topicId: string }) {
  const [chosen, setChosen] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)

  async function choose(value: number) {
    if (saving) return
    setSaving(true)
    try {
      await apiFetch(`/api/topics/${topicId}/confidence`, { method: 'POST', json: { source: 'quiz', value } })
      setChosen(value)
      toast.success('Thanks, your review schedule is updated.')
    } catch {
      toast.error("Couldn't save that. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-border px-4 py-3">
      <p id="confidence-label" className="text-small font-medium text-fg">
        How sure did you feel?
      </p>
      <div role="group" aria-labelledby="confidence-label" className="flex items-center gap-1">
        {CONFIDENCE_LABELS.map((label, index) => {
          const value = index + 1
          const selected = chosen === value
          return (
            <button
              key={value}
              type="button"
              disabled={saving || chosen !== null}
              aria-label={`${value}, ${label}`}
              aria-pressed={selected}
              title={label}
              onClick={() => choose(value)}
              className={cn(
                'grid size-7 place-items-center rounded-chip border text-small tabular transition-colors duration-120 max-sm:size-11',
                selected
                  ? 'border-accent bg-accent-soft text-accent-soft-fg'
                  : 'border-border-strong text-fg-2 hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent'
              )}
            >
              {value}
            </button>
          )
        })}
      </div>
      <p className="text-caption font-normal text-fg-3">1 is a guess, 5 is certain.</p>
    </div>
  )
}

/** The score, a filter, every question reviewed, and a confidence rating. */
export function QuizResults({
  topicId,
  questions,
  result,
  voiceHref,
  onRetake,
  onClose,
}: {
  topicId: string
  questions: PublicQuizQuestion[]
  result: QuizResult
  voiceHref: string
  onRetake: () => void
  onClose: () => void
}) {
  const [filter, setFilter] = React.useState<'all' | 'missed'>('all')
  const entries = React.useMemo(
    () => buildEntries(questions, result.review, result.answers),
    [questions, result.review, result.answers]
  )
  const missed = entries.filter((entry) => !entry.review.isCorrect)
  const shown = filter === 'missed' ? missed : entries
  const score = Math.round(result.score)

  return (
    <div className="max-w-[720px]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <ProgressRing size={96} value={result.score / 100} label={`${score}%`} aria-label={`Score ${score} percent`} />
        <div className="min-w-0 flex-1">
          <h2 className="text-heading text-fg">
            <span className="tabular">
              {points(result.earnedPoints)} of {points(result.totalPoints)} points
            </span>
          </h2>
          <p className="mt-0.5 text-small text-fg-2">
            Your best is <span className="tabular">{Math.round(result.bestScore)}%</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<ArrowCounterClockwise />} onClick={onRetake}>
            Retake
          </Button>
          <Button asChild variant="secondary" icon={<Microphone />}>
            <Link href={voiceHref} scroll={false}>
              Voice review
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <SegmentedControl
          aria-label="Filter questions"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'all', label: `All ${entries.length}` },
            { value: 'missed', label: `Missed ${missed.length}` },
          ]}
        />
      </div>

      <div className="mt-2">
        {shown.length > 0 ? (
          <ReviewList entries={shown} />
        ) : (
          <p className="py-8 text-small text-fg-2">You got every question right. Nothing to review here.</p>
        )}
      </div>

      <ConfidencePrompt topicId={topicId} />

      <div className="mt-8 border-t border-border pt-5">
        <Button variant="ghost" className="-ml-3.5" onClick={onClose}>
          Back to quiz
        </Button>
      </div>
    </div>
  )
}
