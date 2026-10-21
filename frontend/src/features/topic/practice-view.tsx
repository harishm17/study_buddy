'use client'

import * as React from 'react'
import { ArrowRight, Check, CaretLeft, CaretRight, Eye, Lightbulb, Plus, XCircle } from '@phosphor-icons/react/dist/ssr'
import { SourceLine } from '@/components/learning/source-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Input } from '@/components/ui/input'
import { LazyMarkdown } from '@/components/ui/lazy-markdown'
import { MathText } from '@/components/ui/math-text'
import { Progress } from '@/components/ui/progress'
import { QuestionRenderer } from '@/components/ui/question-renderer'
import { pluralize } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ConceptChip } from './concept-chip'
import { GenerateOptions } from './generation-ui'
import { checkPracticeAnswer, splitChoices } from './practice-check'
import { practiceStepKey, type PracticeProgress } from './practice-keys'
import { usePracticeProgress } from './practice-progress'
import type { PracticeContent, PracticeProblem, PracticeStep } from './types'

type Feedback = { key: string; kind: 'correct' | 'incorrect' | 'revealed' }

const stepKeys = (problem: PracticeProblem, problemIndex: number) =>
  problem.steps.map((_step, stepIndex) => practiceStepKey(problemIndex, problem.title, stepIndex))

function stepStatus(progress: PracticeProgress, key: string): 'solved' | 'revealed' | 'open' {
  if (progress.solved.includes(key)) return 'solved'
  if (progress.revealed.includes(key)) return 'revealed'
  return 'open'
}

function problemDone(progress: PracticeProgress, problem: PracticeProblem, problemIndex: number): boolean {
  return stepKeys(problem, problemIndex).every((key) => stepStatus(progress, key) !== 'open')
}

function problemSolved(progress: PracticeProgress, problem: PracticeProblem, problemIndex: number): boolean {
  return stepKeys(problem, problemIndex).every((key) => stepStatus(progress, key) === 'solved')
}

/** The question, the answer control for the step's type, and Check and Hint. */
function ActiveStep({
  step,
  feedback,
  onCheck,
  onTryAgain,
  onReveal,
  onNext,
  isLast,
}: {
  step: PracticeStep
  feedback: Feedback['kind'] | null
  onCheck: (answer: string) => void
  onTryAgain: () => void
  onReveal: () => void
  onNext: () => void
  isLast: boolean
}) {
  const [answer, setAnswer] = React.useState('')
  const [hintShown, setHintShown] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const nextRef = React.useRef<HTMLButtonElement>(null)
  const retryRef = React.useRef<HTMLButtonElement>(null)

  // Options are stored with the step; content written before that has them in the question text.
  const choices =
    step.answerType !== 'multiple_choice'
      ? null
      : step.options.length >= 2
        ? { stem: step.question, options: step.options }
        : splitChoices(step.question)
  const locked = feedback === 'correct' || feedback === 'revealed'

  React.useEffect(() => {
    if (feedback === 'correct' || feedback === 'revealed') nextRef.current?.focus()
    else if (feedback === 'incorrect') retryRef.current?.focus()
  }, [feedback])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!answer.trim() || feedback) return
    onCheck(answer)
  }

  function tryAgain() {
    setAnswer('')
    onTryAgain()
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {choices ? (
        <QuestionRenderer
          question={{
            question_type: 'multiple_choice',
            question_text: choices.stem || 'Choose the answer.',
            options: choices.options,
            points: 0,
          }}
          value={answer}
          onChange={setAnswer}
          disabled={!!feedback}
          showPoints={false}
        />
      ) : (
        <>
          <LazyMarkdown variant="reading" className="text-[16px]! leading-[27px]!">
            {step.question}
          </LazyMarkdown>
          <Input
            ref={inputRef}
            aria-label="Your answer"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode={step.answerType === 'numeric' ? 'decimal' : 'text'}
            placeholder={step.answerType === 'multiple_choice' ? 'Type the letter or the answer' : 'Your answer'}
            value={answer}
            disabled={!!feedback}
            onChange={(event) => setAnswer(event.target.value)}
            containerClassName="max-w-sm"
          />
        </>
      )}

      {hintShown && !locked ? (
        <InlineAlert icon={<Lightbulb />} title="Hint">
          <LazyMarkdown variant="compact" className="text-small! text-fg-2!">
            {step.hint}
          </LazyMarkdown>
        </InlineAlert>
      ) : null}

      {feedback === 'correct' ? (
        <InlineAlert tone="accent" title="Correct" className="items-start">
          <div className="flex flex-col gap-2 text-current">
            {step.feedbackCorrect ? (
              <LazyMarkdown variant="compact" className="text-current!">
                {step.feedbackCorrect}
              </LazyMarkdown>
            ) : null}
            {step.explanation ? (
              <LazyMarkdown variant="compact" className="text-current!">
                {step.explanation}
              </LazyMarkdown>
            ) : null}
          </div>
        </InlineAlert>
      ) : null}

      {feedback === 'incorrect' ? (
        <InlineAlert tone="danger" title="Not quite" icon={<XCircle />}>
          {step.feedbackIncorrect ? (
            <LazyMarkdown variant="compact" className="text-current!">
              {step.feedbackIncorrect}
            </LazyMarkdown>
          ) : (
            'That is not the answer. Try again, or look at the hint.'
          )}
        </InlineAlert>
      ) : null}

      {feedback === 'revealed' ? (
        <InlineAlert title="The answer is shown, so this step won't count as solved.">
          <p className="mt-1 text-body-strong text-fg">
            <MathText>{step.correctAnswer}</MathText>
          </p>
          {step.explanation ? (
            <LazyMarkdown variant="compact" className="mt-2 text-small! text-fg-2!">
              {step.explanation}
            </LazyMarkdown>
          ) : null}
        </InlineAlert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!feedback ? (
          <>
            <Button type="submit" variant="primary" icon={<Check />} disabled={!answer.trim()}>
              Check
            </Button>
            {step.hint && !hintShown ? (
              <Button variant="ghost" icon={<Lightbulb />} onClick={() => setHintShown(true)}>
                Hint
              </Button>
            ) : null}
          </>
        ) : null}
        {feedback === 'incorrect' ? (
          <>
            <Button ref={retryRef} variant="primary" onClick={tryAgain}>
              Try again
            </Button>
            <Button variant="ghost" icon={<Eye />} onClick={onReveal}>
              Show answer
            </Button>
          </>
        ) : null}
        {locked ? (
          <Button ref={nextRef} variant="primary" onClick={onNext} icon={<ArrowRight />}>
            {isLast ? 'Finish' : 'Next step'}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function StepMarker({ status, active, number }: { status: 'solved' | 'revealed' | 'open'; active: boolean; number: number }) {
  if (status === 'solved') {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
        <Check weight="bold" className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Solved</span>
      </span>
    )
  }
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full border text-caption tabular',
        status === 'revealed' && 'border-border-strong bg-surface-2 text-fg-2',
        status === 'open' && active && 'border-accent text-accent ring-2 ring-accent/20',
        status === 'open' && !active && 'border-border text-fg-3'
      )}
    >
      {number}
    </span>
  )
}

function ProblemSwitcher({
  problems,
  progress,
  current,
  onSelect,
}: {
  problems: PracticeProblem[]
  progress: PracticeProgress
  current: number
  onSelect: (index: number) => void
}) {
  return (
    <nav aria-label="Problems" className="flex items-center gap-1">
      <IconButton
        label="Previous problem"
        icon={<CaretLeft />}
        size="sm"
        disabled={current === 0}
        onClick={() => onSelect(current - 1)}
      />
      {problems.map((problem, index) => {
        const solved = problemSolved(progress, problem, index)
        return (
          <button
            key={`${index}-${problem.title}`}
            type="button"
            aria-label={`Problem ${index + 1}${solved ? ', solved' : ''}`}
            aria-current={index === current ? 'true' : undefined}
            onClick={() => onSelect(index)}
            className={cn(
              'grid h-7 min-w-7 place-items-center rounded-chip border px-1.5 text-small tabular transition-colors duration-120 max-sm:h-11 max-sm:min-w-11',
              index === current
                ? 'border-accent bg-accent-soft text-accent-soft-fg'
                : 'border-border text-fg-2 hover:border-border-strong hover:text-fg'
            )}
          >
            {solved ? <Check weight="bold" className="size-3.5" aria-hidden="true" /> : index + 1}
          </button>
        )
      })}
      <IconButton
        label="Next problem"
        icon={<CaretRight />}
        size="sm"
        disabled={current === problems.length - 1}
        onClick={() => onSelect(current + 1)}
      />
    </nav>
  )
}

/**
 * Practice: one problem at a time, worked a step at a time. Answers are checked here in the
 * browser, and solved steps are remembered in localStorage for this topic.
 */
export function PracticeView({ topicId, practice }: { topicId: string; practice: PracticeContent }) {
  const problems = practice.items
  const { progress, markSolved, markRevealed, clear } = usePracticeProgress(topicId)
  const [picked, setPicked] = React.useState<number | null>(null)
  const [feedback, setFeedback] = React.useState<Feedback | null>(null)

  const firstOpenProblem = problems.findIndex((problem, index) => !problemDone(progress, problem, index))
  // Until the student picks one, start where they left off.
  const problemIndex = Math.min(picked ?? Math.max(0, firstOpenProblem), problems.length - 1)
  const problem = problems[problemIndex]
  const keys = stepKeys(problem, problemIndex)
  const statuses = keys.map((key) => stepStatus(progress, key))

  const feedbackIndex = feedback ? keys.indexOf(feedback.key) : -1
  const firstOpenStep = statuses.indexOf('open')
  const activeIndex = feedbackIndex >= 0 ? feedbackIndex : firstOpenStep >= 0 ? firstOpenStep : problem.steps.length
  const complete = activeIndex >= problem.steps.length

  const allKeys = problems.flatMap((item, index) => stepKeys(item, index))
  const solvedTotal = allKeys.filter((key) => progress.solved.includes(key)).length
  const hasNextProblem = problemIndex < problems.length - 1

  function select(index: number) {
    setPicked(Math.max(0, Math.min(problems.length - 1, index)))
    setFeedback(null)
  }

  function onCheck(step: PracticeStep, key: string, answer: string) {
    if (checkPracticeAnswer(step, answer)) {
      markSolved(key)
      setFeedback({ key, kind: 'correct' })
    } else {
      setFeedback({ key, kind: 'incorrect' })
    }
  }

  return (
    <div className="max-w-[720px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-fg-2">
          {pluralize(problems.length, 'problem')}, {pluralize(allKeys.length, 'step')}
        </p>
        <GenerateOptions
          kind="practice"
          mode="more"
          submitLabel="Generate"
          focusPlaceholder="e.g. weighted graphs"
          align="end"
        >
          <Button size="sm" variant="secondary" icon={<Plus />}>
            More practice
          </Button>
        </GenerateOptions>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h2 className="min-w-0 flex-1 text-heading text-fg">
          <span className="tabular text-fg-3">
            Problem {problemIndex + 1} of {problems.length}
          </span>
          <span className="text-fg-3">: </span>
          <MathText>{problem.title}</MathText>
        </h2>
        <ProblemSwitcher problems={problems} progress={progress} current={problemIndex} onSelect={select} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Progress
          aria-label="Steps solved"
          className="flex-1"
          value={allKeys.length ? (solvedTotal / allKeys.length) * 100 : 0}
        />
        <span className="tabular whitespace-nowrap text-caption text-fg-3">
          {solvedTotal} of {allKeys.length} solved
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {problem.problem ? (
          <LazyMarkdown variant="reading" className="text-[16px]! leading-[27px]!">
            {problem.problem}
          </LazyMarkdown>
        ) : null}
        {(problem.difficulty || problem.keyConcepts.length > 0 || problem.minutes) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {problem.difficulty ? (
              <Badge tone={problem.difficulty === 'hard' ? 'warning' : 'neutral'}>
                {problem.difficulty[0].toUpperCase() + problem.difficulty.slice(1)}
              </Badge>
            ) : null}
            {problem.keyConcepts.map((concept) => (
              <ConceptChip key={concept}>{concept}</ConceptChip>
            ))}
            {problem.minutes ? <span className="ml-1 text-caption text-fg-3">About {problem.minutes} min</span> : null}
          </div>
        )}
        <SourceLine sources={problem.sources} />
      </div>

      <ol className="mt-8 flex flex-col">
        {problem.steps.map((step, index) => {
          const key = keys[index]
          const status = statuses[index]
          const active = index === activeIndex
          const resolved = status !== 'open' && !active
          const last = index === problem.steps.length - 1
          return (
            <li
              key={key}
              aria-current={active ? 'step' : undefined}
              className={cn('relative flex gap-3', !last && 'pb-5')}
            >
              {last ? null : <span aria-hidden="true" className="absolute bottom-0 left-3 top-7 w-px bg-border" />}
              <div className="relative z-[1] bg-canvas">
                <StepMarker
                  status={active && feedback?.kind === 'correct' ? 'solved' : status}
                  active={active}
                  number={index + 1}
                />
              </div>
              <div className="min-w-0 flex-1 pt-px">
                {active ? (
                  <ActiveStep
                    key={key}
                    step={step}
                    feedback={feedback?.key === key ? feedback.kind : null}
                    isLast={last}
                    onCheck={(answer) => onCheck(step, key, answer)}
                    onTryAgain={() => setFeedback(null)}
                    onReveal={() => {
                      markRevealed(key)
                      setFeedback({ key, kind: 'revealed' })
                    }}
                    onNext={() => setFeedback(null)}
                  />
                ) : resolved ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="min-w-0 truncate text-small text-fg-2">
                      <span className="text-fg-3">Step {index + 1}</span>
                    </p>
                    <p className="max-w-[60%] truncate text-small font-medium text-fg">
                      {status === 'revealed' ? <span className="mr-1.5 font-normal text-fg-3">Answer shown</span> : null}
                      <MathText>{step.correctAnswer}</MathText>
                    </p>
                  </div>
                ) : (
                  <p className="text-small text-fg-3">Step {index + 1}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {complete ? (
        <InlineAlert
          className="mt-6"
          tone="accent"
          title="Problem complete"
          action={
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="text-current" onClick={() => clear(keys)}>
                Start over
              </Button>
              {hasNextProblem ? (
                <Button size="sm" variant="primary" icon={<ArrowRight />} onClick={() => select(problemIndex + 1)}>
                  Next problem
                </Button>
              ) : null}
            </div>
          }
        >
          You solved {statuses.filter((status) => status === 'solved').length} of {problem.steps.length} steps.
        </InlineAlert>
      ) : null}
    </div>
  )
}
