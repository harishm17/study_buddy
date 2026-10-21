'use client'

import * as React from 'react'
import { CheckCircle, CircleHalf, Question, XCircle } from '@phosphor-icons/react/dist/ssr'
import { Badge } from '@/components/ui/badge'
import { LazyMarkdown } from '@/components/ui/lazy-markdown'
import { MathText } from '@/components/ui/math-text'
import { cn } from '@/lib/utils'

export type ReviewStatus = 'correct' | 'partial' | 'incorrect' | 'review'

/** The status of a graded question: full marks, some marks, none, or not graded automatically. */
export function reviewStatus(item: { isCorrect: boolean; pointsEarned: number; needsReview?: boolean }): ReviewStatus {
  if (item.needsReview) return 'review'
  if (item.isCorrect) return 'correct'
  return item.pointsEarned > 0 ? 'partial' : 'incorrect'
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  correct: 'Correct',
  partial: 'Partly correct',
  incorrect: 'Incorrect',
  review: 'Needs review',
}

function StatusIcon({ status }: { status: ReviewStatus }) {
  const common = 'size-5 shrink-0'
  switch (status) {
    case 'correct':
      return <CheckCircle aria-hidden="true" weight="fill" className={cn(common, 'text-accent')} />
    case 'partial':
      return <CircleHalf aria-hidden="true" weight="fill" className={cn(common, 'text-warning')} />
    case 'review':
      return <Question aria-hidden="true" weight="fill" className={cn(common, 'text-fg-3')} />
    default:
      return <XCircle aria-hidden="true" weight="fill" className={cn(common, 'text-danger')} />
  }
}

export type ReviewItemProps = {
  /** The number shown to the student (1-based). */
  number: number
  questionText: string
  status: ReviewStatus
  points: number
  pointsEarned: number
  /** What the student answered; null when they left it blank. */
  studentAnswer: string | null
  /** The answer is an option the model wrote ("B. text"), so it may hold math. Typed answers are plain. */
  studentAnswerIsOption?: boolean
  /** Shown for wrong, partial and ungraded answers. */
  correctAnswer?: string | null
  /** The grader's note (short answers). */
  feedback?: string | null
  /** Why the answer is what it is (markdown). */
  explanation?: string | null
  /** The topic the question belongs to, shown as a small badge. */
  topicName?: string | null
  className?: string
}

const formatPoints = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-fg-3">{label}</dt>
      <dd className="mt-0.5 text-small text-fg">{children}</dd>
    </div>
  )
}

/**
 * One graded question: status, the question, the points, the student's answer and, when it was
 * not fully right, the correct answer, the grader's feedback and the explanation. Shared by the
 * mock exam results and the quiz review.
 */
export function ReviewItem({
  number,
  questionText,
  status,
  points,
  pointsEarned,
  studentAnswer,
  studentAnswerIsOption,
  correctAnswer,
  feedback,
  explanation,
  topicName,
  className,
}: ReviewItemProps) {
  const showKey = status !== 'correct'
  return (
    <li className={cn('flex gap-3 border-b border-border py-5 first:pt-0 last:border-b-0', className)}>
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{STATUS_LABEL[status]}. </span>
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-body-strong text-fg">
            <span className="mr-2 tabular text-fg-3">{number}</span>
            <MathText>{questionText}</MathText>
          </p>
          <span className="shrink-0 tabular text-small text-fg-2">
            {formatPoints(pointsEarned)}/{formatPoints(points)}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {topicName ? <Badge>{topicName}</Badge> : null}
          {status === 'review' ? <Badge tone="warning">Needs review</Badge> : null}
          {status === 'partial' ? <Badge tone="warning">Partly correct</Badge> : null}
        </div>

        <dl className="mt-3 flex flex-col gap-3">
          <Detail label="Your answer">
            {studentAnswer ? (
              <span className="whitespace-pre-wrap break-words">
                {studentAnswerIsOption ? <MathText>{studentAnswer}</MathText> : studentAnswer}
              </span>
            ) : (
              <span className="text-fg-3">No answer</span>
            )}
          </Detail>
          {showKey && correctAnswer ? (
            <Detail label="Correct answer">
              <span className="whitespace-pre-wrap break-words">
                <MathText>{correctAnswer}</MathText>
              </span>
            </Detail>
          ) : null}
          {feedback ? (
            <Detail label="Feedback">
              <span className="whitespace-pre-wrap break-words text-fg-2">
                <MathText>{feedback}</MathText>
              </span>
            </Detail>
          ) : null}
          {showKey && explanation ? (
            <Detail label="Why">
              <LazyMarkdown variant="compact">{explanation}</LazyMarkdown>
            </Detail>
          ) : null}
        </dl>
      </div>
    </li>
  )
}
