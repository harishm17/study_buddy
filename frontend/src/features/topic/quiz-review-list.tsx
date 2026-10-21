'use client'

import * as React from 'react'
import { CheckCircle, CircleHalf, XCircle } from '@phosphor-icons/react/dist/ssr'
import { SourceLine } from '@/components/learning/source-link'
import { LazyMarkdown } from '@/components/ui/lazy-markdown'
import { MathText } from '@/components/ui/math-text'
import type { PublicQuizQuestion } from '@/lib/learning/quiz-questions'
import type { QuizReviewItem } from '@/lib/learning/quiz-review'
import { formatAnswer, formatKey, reviewState } from './quiz-format'

export type ReviewEntry = {
  /** Zero-based position in the quiz. */
  index: number
  question: PublicQuizQuestion
  review: QuizReviewItem
  answer: string
}

/** Pair graded results with their questions and the student's answers. */
export function buildEntries(
  questions: PublicQuizQuestion[],
  review: QuizReviewItem[],
  answers: Record<string, string>
): ReviewEntry[] {
  return review
    .map((item) => ({
      index: item.questionIndex,
      question: questions[item.questionIndex],
      review: item,
      answer: answers[String(item.questionIndex)] ?? '',
    }))
    .filter((entry): entry is ReviewEntry => !!entry.question)
}

const points = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 text-small">
      <span className="font-medium text-fg">{label}: </span>
      <span className="text-fg-2">{children}</span>
    </div>
  )
}

/**
 * Graded questions one under another: status, the question, points, the student's answer, and
 * for wrong or partial ones the correct (or sample) answer, the grader's feedback and why.
 */
export function ReviewList({ entries }: { entries: ReviewEntry[] }) {
  return (
    <ol className="divide-y divide-border">
      {entries.map(({ index, question, review, answer }) => {
        const state = reviewState(review)
        const shortAnswer = question.question_type === 'short_answer'
        // Typed answers are the student's own words; options and keys are the model's.
        const typed = shortAnswer || question.question_type === 'numerical'
        const given = formatAnswer(question, answer)
        return (
          <li key={index} className="flex gap-3 py-4">
            <span className="mt-0.5 shrink-0">
              {state === 'correct' ? (
                <CheckCircle weight="fill" className="size-5 text-accent" aria-label="Correct" />
              ) : state === 'partial' ? (
                <CircleHalf weight="fill" className="size-5 text-warning" aria-label="Partly correct" />
              ) : (
                <XCircle weight="fill" className="size-5 text-danger" aria-label="Incorrect" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <p className="text-body-strong text-fg">
                  <span className="tabular mr-2 text-fg-3">{index + 1}</span>
                  <MathText>{question.question_text}</MathText>
                </p>
                <span className="tabular whitespace-nowrap text-small text-fg-2">
                  {points(review.pointsEarned)}/{points(review.pointsPossible)}
                </span>
              </div>

              <Detail label="Your answer">
                {given ? (
                  <span className="whitespace-pre-wrap break-words">
                    {typed ? given : <MathText>{given}</MathText>}
                  </span>
                ) : (
                  <span className="text-fg-3">No answer</span>
                )}
              </Detail>

              {state !== 'correct' ? (
                <>
                  {review.correctAnswer ? (
                    <Detail label={shortAnswer ? 'Sample answer' : 'Correct answer'}>
                      <span className="whitespace-pre-wrap break-words">
                        <MathText>{formatKey(question, review.correctAnswer)}</MathText>
                      </span>
                    </Detail>
                  ) : null}
                  {review.feedback ? (
                    <Detail label="Feedback">
                      <MathText>{review.feedback}</MathText>
                    </Detail>
                  ) : null}
                  {review.explanation ? (
                    <div className="mt-2">
                      <p className="text-small font-medium text-fg">Why</p>
                      <LazyMarkdown variant="compact" className="mt-0.5 text-small! text-fg-2!">
                        {review.explanation}
                      </LazyMarkdown>
                    </div>
                  ) : null}
                </>
              ) : null}
              <SourceLine sources={review.sources} className="mt-2" />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
