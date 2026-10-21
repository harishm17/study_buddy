'use client'

import * as React from 'react'
import { CaretDown, CheckCircle, ListNumbers, Plus } from '@phosphor-icons/react/dist/ssr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LazyMarkdown } from '@/components/ui/lazy-markdown'
import { pluralize } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CompletionRow } from './completion-row'
import { GenerateOptions } from './generation-ui'
import { useMarkComplete } from './use-mark-complete'
import type { ExamplesContent, SolvedExample } from './types'

function StepTimeline({ example, visible }: { example: SolvedExample; visible: number }) {
  return (
    <ol className="flex flex-col">
      {example.steps.slice(0, visible).map((step, index) => {
        const last = index === Math.min(visible, example.steps.length) - 1
        return (
          <li key={`${step.number}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
            {last ? null : <span aria-hidden="true" className="absolute bottom-0 left-3 top-7 w-px bg-border" />}
            <span
              aria-hidden="true"
              className="relative z-[1] grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-caption text-fg-2 tabular"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 pt-px">
              {step.description ? (
                <p className="text-body-strong text-fg">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.description}
                </p>
              ) : null}
              {step.work ? <LazyMarkdown variant="compact" className="mt-2">{step.work}</LazyMarkdown> : null}
              {step.explanation ? (
                <LazyMarkdown variant="compact" className="mt-2 text-small! text-fg-2!">
                  {step.explanation}
                </LazyMarkdown>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ExampleCard({
  example,
  index,
  open,
  onToggle,
  stepMode,
  shown,
  onShowNext,
}: {
  example: SolvedExample
  index: number
  open: boolean
  onToggle: () => void
  stepMode: boolean
  shown: number
  onShowNext: () => void
}) {
  const panelId = React.useId()
  const visible = stepMode ? Math.min(example.steps.length, Math.max(1, shown)) : example.steps.length
  const allShown = visible >= example.steps.length

  return (
    <Card className="p-0">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center gap-3 rounded-card px-5 py-4 text-left"
        >
          <span className="tabular text-body-strong text-fg-3">{index + 1}</span>
          <span className="min-w-0 flex-1 text-subheading text-fg">{example.title}</span>
          {example.difficulty ? (
            <Badge tone={example.difficulty === 'hard' ? 'warning' : 'neutral'}>
              {example.difficulty[0].toUpperCase() + example.difficulty.slice(1)}
            </Badge>
          ) : null}
          <CaretDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 text-fg-3 transition-transform duration-180', open && 'rotate-180')}
          />
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="flex flex-col gap-6 border-t border-border px-5 pb-5 pt-5">
          {example.problem ? (
            <LazyMarkdown variant="reading" className="text-[16px]! leading-[27px]!">
              {example.problem}
            </LazyMarkdown>
          ) : null}

          {example.steps.length > 0 ? (
            <section aria-label="Solution">
              <h3 className="mb-3 text-subheading text-fg">Solution</h3>
              <StepTimeline example={example} visible={visible} />
              {stepMode && !allShown ? (
                <Button className="mt-4" size="sm" variant="secondary" onClick={onShowNext}>
                  Show next step
                </Button>
              ) : null}
            </section>
          ) : null}

          {example.finalAnswer && allShown ? (
            <section aria-label="Answer" className="rounded-card bg-accent-soft p-4 text-accent-soft-fg">
              <h3 className="mb-1.5 flex items-center gap-2 text-subheading">
                <CheckCircle aria-hidden="true" weight="fill" className="size-4" />
                Answer
              </h3>
              <LazyMarkdown variant="compact" className="text-accent-soft-fg!">
                {example.finalAnswer}
              </LazyMarkdown>
            </section>
          ) : null}

          {example.keyConcepts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-small text-fg-2">Key concepts</span>
              {example.keyConcepts.map((concept) => (
                <Badge key={concept}>{concept}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

type ExamplesViewProps = {
  topicId: string
  examples: ExamplesContent
  completed: boolean
  nextHref: string
}

/** Worked examples as disclosure cards, with an optional step-by-step reveal. */
export function ExamplesView({ topicId, examples, completed, nextHref }: ExamplesViewProps) {
  const items = examples.items
  const [openIds, setOpenIds] = React.useState<number[]>([0])
  const [stepMode, setStepMode] = React.useState(false)
  const [shown, setShown] = React.useState<Record<number, number>>({})
  const { completed: isCompleted, saving, mark } = useMarkComplete(topicId, 'examplesCompleted', completed)

  const toggle = (index: number) =>
    setOpenIds((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]))

  return (
    <div className="max-w-[720px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-fg-2">{pluralize(items.length, 'example')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<ListNumbers />}
            aria-pressed={stepMode}
            onClick={() => setStepMode((current) => !current)}
          >
            {stepMode ? 'Show all steps' : 'Step by step'}
          </Button>
          <GenerateOptions
            kind="examples"
            mode="more"
            submitLabel="Generate"
            focusPlaceholder="e.g. problems with cycles"
            align="end"
          >
            <Button size="sm" variant="secondary" icon={<Plus />}>
              More examples
            </Button>
          </GenerateOptions>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((example, index) => (
          <ExampleCard
            key={`${index}-${example.title}`}
            example={example}
            index={index}
            open={openIds.includes(index)}
            onToggle={() => toggle(index)}
            stepMode={stepMode}
            shown={shown[index] ?? 1}
            onShowNext={() => setShown((current) => ({ ...current, [index]: (current[index] ?? 1) + 1 }))}
          />
        ))}
      </div>

      <CompletionRow
        completed={isCompleted}
        saving={saving}
        markLabel="Mark as done"
        doneText="You've worked through these examples."
        nextHref={nextHref}
        nextLabel="Next: Practice"
        onMark={mark}
      />
    </div>
  )
}
