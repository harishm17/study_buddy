'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { ReviewItem, reviewStatus } from '@/components/learning/review-item'
import { Button } from '@/components/ui/button'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Progress } from '@/components/ui/progress'
import { ProgressRing } from '@/components/ui/progress-ring'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useJob } from '@/features/jobs/use-job'
import { describeJobFailure } from '@/lib/jobs/failure-message'
import { cn } from '@/lib/utils'
import type { ExamResult } from '@/server/queries/mock-exams'
import { GradeAgainButton, StartExamButton } from './exam-actions'
import { formatScore } from './exam-options'

type Graded = Extract<ExamResult, { status: 'graded' }>
type NotGraded = Extract<ExamResult, { status: 'grading' | 'failed' }>

type Filter = 'all' | 'missed' | 'review'

const pointsText = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

/** Grading in progress: a calm panel that refreshes the page when the job finishes. */
export function GradingPanel({ result }: { result: NotGraded }) {
  const router = useRouter()
  const { job, timedOut } = useJob(result.jobId, {
    timeoutMs: 300_000,
    onSettled: () => router.refresh(),
  })

  // With no job to follow (it was just created), look again every few seconds.
  React.useEffect(() => {
    if (result.jobId) return
    const timer = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(timer)
  }, [result.jobId, router])

  return (
    <div role="status" aria-live="polite" className="mx-auto flex max-w-[480px] flex-col items-center py-16 text-center">
      <h2 className="text-heading text-fg">Grading your exam</h2>
      <p className="mt-1.5 text-small text-fg-2">
        {timedOut
          ? 'Still working in the background. You can leave this page and come back.'
          : 'Short answers are read one by one, so this can take a minute. You can leave this page.'}
      </p>
      <Progress
        aria-label="Grading progress"
        className="mt-6 max-w-[320px]"
        indeterminate
        value={job?.progressPercent ?? 0}
      />
    </div>
  )
}

/** Grading did not finish. The answers are safe; "Grade again" tries once more. */
export function GradingFailed({ result }: { result: NotGraded }) {
  return (
    <div className="max-w-[560px] py-4">
      <InlineAlert
        tone="danger"
        icon={<WarningCircle />}
        title="Grading didn't finish"
        action={<GradeAgainButton courseId={result.courseId} examId={result.examId} submissionId={result.id} size="md" navigate={false} />}
      >
        Your answers are saved. {result.errorCode ? describeJobFailure(result.errorCode, result.errorMessage) : 'Grade the exam again to see your score.'}
      </InlineAlert>
      <div className="mt-5">
        <Button asChild variant="link">
          <Link href={`/courses/${result.courseId}/exams`}>Back to mock exams</Link>
        </Button>
      </div>
    </div>
  )
}

function FocusRow({ topic, courseId }: { topic: Graded['topics'][number]; courseId: string }) {
  const low = topic.percent < 60
  return (
    <li className="flex items-center gap-4 border-b border-border py-3">
      <span className="min-w-0 flex-1 truncate text-body text-fg">{topic.topicName}</span>
      <span aria-hidden="true" className="hidden h-1 w-32 shrink-0 sm:block">
        <span
          className={cn('block h-full rounded-full', low ? 'bg-warning' : 'bg-accent')}
          style={{ width: `${Math.max(2, Math.min(100, topic.percent))}%` }}
        />
      </span>
      <span className="w-12 shrink-0 text-right tabular text-body-strong text-fg">{formatScore(topic.percent)}</span>
      <span className="w-[68px] shrink-0 text-right">
        {topic.linkable && topic.topicId ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/courses/${courseId}/topics/${topic.topicId}`} aria-label={`Study ${topic.topicName}`}>
              Study
            </Link>
          </Button>
        ) : null}
      </span>
    </li>
  )
}

/** The graded results: score, where to focus, and every question with its review. */
export function GradedResults({ result, submittedLabel }: { result: Graded; submittedLabel: string }) {
  const [filter, setFilter] = React.useState<Filter>('all')
  const missed = result.questions.filter((q) => !q.isCorrect && !q.needsReview)
  const review = result.questions.filter((q) => q.needsReview)
  const shown = filter === 'all' ? result.questions : filter === 'missed' ? missed : review

  const options: { value: Filter; label: string }[] = [
    { value: 'all', label: `All ${result.questions.length}` },
    { value: 'missed', label: `Missed ${missed.length}` },
    ...(review.length > 0 ? [{ value: 'review' as const, label: `Needs review ${review.length}` }] : []),
  ]

  return (
    <div className="flex flex-col gap-12">
      <section aria-label="Your score" className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <ProgressRing
          size={96}
          value={result.totalPoints > 0 ? result.score / 100 : null}
          aria-label={`Score ${formatScore(result.score)}`}
          label={<span className="text-[26px] font-semibold tracking-tight">{Math.round(result.score)}%</span>}
        />
        <div className="min-w-0">
          <p className="text-display tabular text-fg">
            {pointsText(result.earnedPoints)} <span className="text-fg-2">of {pointsText(result.totalPoints)} points</span>
          </p>
          <p className="mt-1 text-small text-fg-2">
            {result.examTitle}, submitted {submittedLabel}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StartExamButton courseId={result.courseId} examId={result.examId} variant="secondary" size="md" label="Retake exam" />
            <Button asChild variant="ghost">
              <Link href={`/courses/${result.courseId}/exams`}>Back to exams</Link>
            </Button>
          </div>
        </div>
      </section>

      {result.topics.length > 0 ? (
        <section aria-labelledby="where-to-focus">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="where-to-focus" className="text-heading text-fg">
              Where to focus
            </h2>
            <span className="text-small text-fg-3">Weakest first</span>
          </div>
          <ul className="mt-3 border-t border-border">
            {result.topics.map((topic) => (
              <FocusRow key={topic.topicId ?? topic.topicName} topic={topic} courseId={result.courseId} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="exam-questions-review">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="exam-questions-review" className="text-heading text-fg">
            Questions
          </h2>
          <SegmentedControl aria-label="Show questions" value={filter} onValueChange={setFilter} options={options} />
        </div>
        {shown.length === 0 ? (
          <p className="mt-6 text-small text-fg-2">
            {filter === 'missed' ? 'You got every question right.' : 'Nothing needs review.'}
          </p>
        ) : (
          <ol className="mt-5">
            {shown.map((question) => (
              <ReviewItem
                key={question.questionIndex}
                number={question.questionIndex + 1}
                questionText={question.questionText}
                status={reviewStatus(question)}
                points={question.points}
                pointsEarned={question.pointsEarned}
                studentAnswer={question.studentAnswer}
                studentAnswerIsOption={question.questionType === 'multiple_choice'}
                correctAnswer={question.correctAnswer}
                feedback={question.feedback}
                topicName={question.topicName}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
