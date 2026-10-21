'use client'

import * as React from 'react'
import { CaretDown, Plus } from '@phosphor-icons/react/dist/ssr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { formatDate, formatDateTime, pluralize } from '@/lib/format'
import type { QuizAttemptData, QuizSetData } from '@/server/queries/topic'
import { cn } from '@/lib/utils'
import { GenerateOptions } from './generation-ui'
import { ReviewList, buildEntries } from './quiz-review-list'
import { ViewSkeleton } from './skeletons'
import { useHydrated } from './use-hydrated'

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'multiple choice',
  short_answer: 'short answer',
  numerical: 'numerical',
  true_false: 'true or false',
}

/** "multiple choice, short answer, numerical", in the order the types first appear. */
export function questionMix(set: QuizSetData): string {
  const seen = new Set<string>()
  for (const question of set.questions) seen.add(question.question_type)
  return [...seen].map((type) => TYPE_LABELS[type] ?? type).join(', ')
}

const scoreTone = (score: number) => (score >= 70 ? 'accent' : 'neutral')

function Attempt({ attempt, set, showSet }: { attempt: QuizAttemptData; set: QuizSetData | undefined; showSet: boolean }) {
  const [open, setOpen] = React.useState(false)
  const panelId = React.useId()
  const entries = React.useMemo(
    () => (set && attempt.review ? buildEntries(set.questions, attempt.review, attempt.answers) : []),
    [set, attempt.review, attempt.answers]
  )

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <time dateTime={attempt.takenAt} suppressHydrationWarning className="tabular min-w-0 flex-1 text-small text-fg">
          {formatDateTime(attempt.takenAt)}
          {showSet ? <span className="ml-2 text-fg-3">{set?.label ?? 'Earlier set'}</span> : null}
        </time>
        <Badge tone={scoreTone(attempt.score)} className="tabular">
          {Math.round(attempt.score)}%
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          Review
          <CaretDown className={cn('ml-1 size-3.5 transition-transform duration-180', open && 'rotate-180')} />
        </Button>
      </div>
      {open ? (
        <div id={panelId} className="mt-2 rounded-card border border-border px-4">
          {entries.length > 0 ? (
            <ReviewList entries={entries} />
          ) : (
            <p className="py-4 text-small text-fg-2">The review isn&apos;t available for this attempt any more.</p>
          )}
        </div>
      ) : null}
    </li>
  )
}

type QuizLobbyProps = {
  sets: QuizSetData[]
  attempts: QuizAttemptData[]
  setId: string
  onSetChange: (id: string) => void
  onStart: () => void
  /** A new set is being written: the lobby body gives way to a skeleton. */
  generating: boolean
}

/** Pick a set, see how you did, start, or create a new set. */
export function QuizLobby({ sets, attempts, setId, onSetChange, onStart, generating }: QuizLobbyProps) {
  const hydrated = useHydrated()
  const set = sets.find((item) => item.id === setId) ?? sets[0]
  const setAttempts = attempts.filter((attempt) => attempt.setId === set.id)
  const best = setAttempts.length > 0 ? Math.max(...setAttempts.map((attempt) => attempt.score)) : null
  const multipleSets = sets.length > 1

  return (
    <div className="max-w-[720px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading text-fg">Quiz</h2>
        <GenerateOptions kind="quiz" mode="regenerate" submitLabel="Create quiz set" align="end">
          <Button size="sm" variant="secondary" icon={<Plus />} disabled={generating}>
            New quiz set
          </Button>
        </GenerateOptions>
      </div>

      {generating ? (
        <div className="mt-6">
          <ViewSkeleton kind="quiz" />
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 items-center gap-3">
              {multipleSets ? (
                <Select
                  aria-label="Quiz set"
                  value={set.id}
                  onValueChange={onSetChange}
                  className="w-56"
                  options={sets.map((item) => ({
                    value: item.id,
                    label: hydrated ? `${item.label}, ${formatDate(item.createdAt)}` : item.label,
                    hint: pluralize(item.questions.length, 'question'),
                  }))}
                />
              ) : (
                <p className="text-subheading text-fg">{set.label}</p>
              )}
              <span className="whitespace-nowrap text-small text-fg-2">
                {pluralize(set.questions.length, 'question')}
              </span>
            </div>
            <p className="tabular text-small text-fg-2">
              {best !== null ? `Best ${Math.round(best)}%, ` : ''}
              {setAttempts.length === 0 ? 'No attempts yet' : pluralize(setAttempts.length, 'attempt')}
            </p>
          </div>

          <p className="mt-4 text-small text-fg-2">Mix: {questionMix(set)}</p>
          <p className="mt-1 text-small text-fg-2">
            Answers are checked when you submit. Short answers are graded with feedback.
          </p>

          <Button className="mt-6" size="lg" variant="primary" onClick={onStart}>
            Start quiz
          </Button>
        </>
      )}

      {attempts.length > 0 ? (
        <section aria-labelledby="past-attempts" className="mt-12">
          <h3 id="past-attempts" className="text-subheading text-fg">
            Past attempts
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {attempts.slice(0, 10).map((attempt) => (
              <Attempt
                key={attempt.id}
                attempt={attempt}
                set={sets.find((item) => item.id === attempt.setId)}
                showSet={multipleSets}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
