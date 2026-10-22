'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { InlineAlert } from '@/components/ui/inline-alert'
import { JobStatus } from '@/components/ui/job-status'
import { MasteryIndicator } from '@/components/ui/mastery-indicator'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import { apiFetch, isApiError } from '@/lib/api/client'
import { useJob } from '@/features/jobs/use-job'
import { pollFailureMessage } from '@/lib/jobs/poll-job'
import { cn } from '@/lib/utils'
import {
  DEFAULT_EXAM_CONFIG,
  DIFFICULTIES,
  QUESTION_COUNTS,
  QUESTION_MIXES,
  TIME_LIMITS,
  difficultyLabel,
  type Difficulty,
  type QuestionMix,
} from './exam-options'

export type ExamTopicChoice = { id: string; name: string; mastery: number | null }

type Props = {
  courseId: string
  topics: ExamTopicChoice[]
  /** Topics to tick at first: due for review or not yet strong. */
  preselected: string[]
  /** An exam being written already, found on the server after a refresh. */
  activeJob: { id: string; startedAt: string } | null
  /** The course has a past exam with a style profile, so there is something to match. */
  hasExamStyle: boolean
}

// Exams can take a couple of minutes to write.
const EXAM_JOB_TIMEOUT_MS = 300_000

function SectionLabel({ id, children, hint }: { id: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <h2 id={id} className="text-small font-medium text-fg">
        {children}
      </h2>
      {hint ? <p className="mt-0.5 text-caption font-normal text-fg-3">{hint}</p> : null}
    </div>
  )
}

/** The mock exam form, then the "Writing your exam" wait, then the lobby of the new exam. */
export function NewExamForm({ courseId, topics, preselected, activeJob, hasExamStyle }: Props) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(preselected))
  const [totalQuestions, setTotalQuestions] = React.useState<number>(DEFAULT_EXAM_CONFIG.totalQuestions)
  const [durationMinutes, setDurationMinutes] = React.useState<number>(DEFAULT_EXAM_CONFIG.durationMinutes)
  const [difficulty, setDifficulty] = React.useState<Difficulty>(DEFAULT_EXAM_CONFIG.difficultyLevel)
  const [mix, setMix] = React.useState<QuestionMix>(DEFAULT_EXAM_CONFIG.mix)
  const [matchPastExams, setMatchPastExams] = React.useState(true)
  const [jobId, setJobId] = React.useState<string | null>(activeJob?.id ?? null)
  const [startedAt, setStartedAt] = React.useState<string | null>(activeJob?.startedAt ?? null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const { job, timedOut } = useJob(jobId, {
    timeoutMs: EXAM_JOB_TIMEOUT_MS,
    onSettled: (result) => {
      if (result.state === 'completed') {
        const examId = result.job?.resultData?.exam_id
        router.push(typeof examId === 'string' ? `/courses/${courseId}/exams/${examId}` : `/courses/${courseId}/exams`)
      } else if (result.state === 'failed' && result.job?.status !== 'failed') {
        // The poll itself broke (not a failed job): back to the form with the reason.
        setJobId(null)
        setError(pollFailureMessage(result, 'The exam could not be written. Try again.'))
      }
    },
  })

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  async function create() {
    setError(null)
    setSubmitting(true)
    try {
      const result = await apiFetch<{ jobId: string }>(`/api/projects/${courseId}/generate-exam`, {
        method: 'POST',
        json: {
          topicIds: topics.filter((topic) => selected.has(topic.id)).map((topic) => topic.id),
          totalQuestions,
          durationMinutes,
          difficultyLevel: difficulty,
          questionTypeDistribution: QUESTION_MIXES[mix].distribution,
          ...(hasExamStyle && matchPastExams ? { matchPastExams: true } : {}),
        },
      })
      setStartedAt(new Date().toISOString())
      setJobId(result.jobId)
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : 'Could not start your exam. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (jobId !== null) {
    return (
      <div aria-live="polite">
        <div className="rounded-card border border-border bg-surface p-5">
          <JobStatus
            job={job}
            label="Writing your exam"
            since={startedAt}
            timedOut={timedOut}
            onRetry={() => void create()}
            retrying={submitting}
          />
          {error ? <InlineAlert className="mt-3" tone="danger">{error}</InlineAlert> : null}
          <p className="mt-3 text-small text-fg-2">
            This takes about a minute or two. You can leave this page and come back, your exam will be in the list.
          </p>
        </div>
        <div aria-hidden="true" className="mt-6 flex flex-col gap-4 rounded-card border border-border p-5">
          <Skeleton className="h-6 w-56 rounded-chip" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24 rounded-chip" />
            <Skeleton className="h-5 w-20 rounded-chip" />
            <Skeleton className="h-5 w-16 rounded-chip" />
          </div>
          <SkeletonText lines={3} />
        </div>
        <div className="mt-6">
          <Button asChild variant="link">
            <Link href={`/courses/${courseId}/exams`}>Back to mock exams</Link>
          </Button>
        </div>
      </div>
    )
  }

  const allSelected = selected.size === topics.length
  const distribution = QUESTION_MIXES[mix].distribution

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (selected.size > 0 && !submitting) void create()
      }}
      className="flex flex-col gap-8"
    >
      <section aria-labelledby="exam-topics" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <SectionLabel id="exam-topics" hint="Topics that are due or still being learned are ticked for you.">
            Topics
          </SectionLabel>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" size="sm" variant="ghost" disabled={allSelected} onClick={() => setSelected(new Set(topics.map((t) => t.id)))}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {topics.map((topic) => {
            const checked = selected.has(topic.id)
            return (
              <li key={topic.id}>
                <label
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-body text-fg',
                    'transition-colors duration-120 hover:bg-surface-2',
                    checked ? 'border-accent bg-accent-soft hover:bg-accent-soft' : 'border-control bg-surface'
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={(value) => toggle(topic.id, value === true)} className="mt-0" />
                  <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                  <MasteryIndicator mastery={topic.mastery} variant="ring" />
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="exam-questions" className="flex flex-col gap-2">
        <SectionLabel id="exam-questions">Questions</SectionLabel>
        <SegmentedControl
          aria-labelledby="exam-questions"
          value={String(totalQuestions)}
          onValueChange={(value) => setTotalQuestions(Number(value))}
          options={QUESTION_COUNTS.map((count) => ({ value: String(count), label: String(count) }))}
          className="self-start"
        />
      </section>

      <section aria-labelledby="exam-time" className="flex flex-col gap-2">
        <SectionLabel id="exam-time">Time limit</SectionLabel>
        <SegmentedControl
          aria-labelledby="exam-time"
          value={String(durationMinutes)}
          onValueChange={(value) => setDurationMinutes(Number(value))}
          options={TIME_LIMITS.map((minutes) => ({ value: String(minutes), label: `${minutes} min` }))}
          className="self-start"
        />
      </section>

      <section aria-labelledby="exam-difficulty" className="flex flex-col gap-2">
        <SectionLabel id="exam-difficulty">Difficulty</SectionLabel>
        <SegmentedControl
          aria-labelledby="exam-difficulty"
          value={difficulty}
          onValueChange={setDifficulty}
          options={DIFFICULTIES.map((level) => ({ value: level, label: difficultyLabel(level) }))}
          className="self-start"
        />
      </section>

      <section aria-labelledby="exam-mix" className="flex flex-col gap-2">
        <SectionLabel
          id="exam-mix"
          hint={`${distribution.multiple_choice}% multiple choice, ${distribution.short_answer}% short answer, ${distribution.numerical}% numerical.`}
        >
          Question mix
        </SectionLabel>
        <SegmentedControl
          aria-labelledby="exam-mix"
          value={mix}
          onValueChange={setMix}
          options={(Object.keys(QUESTION_MIXES) as QuestionMix[]).map((key) => ({ value: key, label: QUESTION_MIXES[key].label }))}
          className="self-start"
        />
      </section>

      {hasExamStyle ? (
        <section aria-labelledby="exam-style" className="flex flex-col gap-2">
          <SectionLabel id="exam-style">Style</SectionLabel>
          <label
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-control border px-3 py-2.5 text-body text-fg',
              'transition-colors duration-120 hover:bg-surface-2',
              matchPastExams ? 'border-accent bg-accent-soft hover:bg-accent-soft' : 'border-control bg-surface'
            )}
          >
            <Checkbox
              checked={matchPastExams}
              onCheckedChange={(value) => setMatchPastExams(value === true)}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="block">Match my past exams</span>
              <span className="mt-0.5 block text-caption font-normal text-fg-3">
                Questions follow the wording, task verbs and answer length of the exams you uploaded. The question mix above stays as chosen.
              </span>
            </span>
          </label>
        </section>
      ) : null}

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" variant="primary" size="lg" loading={submitting} disabled={selected.size === 0}>
          Create exam
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href={`/courses/${courseId}/exams`}>Cancel</Link>
        </Button>
        {selected.size === 0 ? <span className="text-small text-fg-2">Pick at least one topic.</span> : null}
      </div>
    </form>
  )
}
