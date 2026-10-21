'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Exam, Lightbulb, Notebook, PencilSimple, PencilSimpleLine } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/shell/page'
import { Button } from '@/components/ui/button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tooltip } from '@/components/ui/tooltip'
import { masteryLabel, masteryLevel, masteryPercent, masteryTone } from '@/lib/mastery'
import { cn } from '@/lib/utils'
import type { GenerationState } from '@/server/queries/course'
import { BuildingContent } from './building-content'
import { needsWorkOrder, type GlyphState } from './summary'

export type ListTopic = {
  id: string
  name: string
  description: string | null
  orderIndex: number
  mastery: number | null
  dueAt: string | null
  /** "Due today" or "Next review in 4 days", worked out on the server. */
  timing: { due: boolean; text: string } | null
  path: { notes: GlyphState; examples: GlyphState; practice: GlyphState; quiz: GlyphState; quizScore: number | null }
}

type GlyphProps = {
  label: string
  state: GlyphState
  icon: React.ReactNode
  score?: number | null
}

const STATE_WORDS: Record<GlyphState, string> = {
  done: 'done',
  ready: 'ready',
  missing: 'not written yet',
}

/** One of the four study path circles: filled with a check when done, ringed when it exists, dashed when missing. */
function Glyph({ label, state, icon, score }: GlyphProps) {
  const hasScore = score !== null && score !== undefined
  const words = hasScore ? `${label}: best ${Math.round(score)}%` : `${label}: ${STATE_WORDS[state]}`
  const base = 'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tabular [&>svg]:size-3'
  const look =
    state === 'done'
      ? 'bg-accent text-accent-fg'
      : state === 'ready'
        ? 'border-2 border-accent text-accent'
        : 'border border-dashed border-border-strong text-fg-3'
  return (
    <Tooltip content={words}>
      <span role="img" aria-label={words} className={cn(base, look, hasScore && 'px-1.5')}>
        {hasScore ? `${Math.round(score)}%` : state === 'done' ? <Check weight="bold" /> : icon}
      </span>
    </Tooltip>
  )
}

function TopicRowItem({ courseId, topic }: { courseId: string; topic: ListTopic }) {
  const level = masteryLevel(topic.mastery)
  const percent = masteryPercent(topic.mastery)
  const { path } = topic
  return (
    <li>
      <Link
        href={`/courses/${courseId}/topics/${topic.id}`}
        className="group flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 rounded-control px-2 py-2.5 transition-colors duration-120 hover:bg-surface-2 sm:flex-nowrap"
      >
        <ProgressRing
          size={28}
          value={level === 'none' ? null : topic.mastery}
          tone={masteryTone(level) === 'warning' ? 'warning' : 'accent'}
          aria-label={percent === null ? 'Not started' : `${masteryLabel(topic.mastery)}, ${percent}%`}
        />
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate text-body-strong text-fg">{topic.name}</p>
          {topic.description ? <p className="truncate text-small text-fg-2">{topic.description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Study path">
          <Glyph label="Notes" state={path.notes} icon={<Notebook />} />
          <Glyph label="Worked examples" state={path.examples} icon={<Lightbulb />} />
          <Glyph label="Practice" state={path.practice} icon={<PencilSimpleLine />} />
          <span className="inline-flex w-10 justify-center">
            <Glyph label="Quiz" state={path.quiz} icon={<Exam />} score={path.quizScore} />
          </span>
        </div>
        <div className="flex w-full shrink-0 flex-col sm:w-40 sm:items-end">
          <span className="text-small text-fg">{masteryLabel(topic.mastery)}</span>
          {topic.timing ? (
            <span
              suppressHydrationWarning
              className={cn('text-caption font-normal', topic.timing.due ? 'text-warning-soft-fg' : 'text-fg-3')}
            >
              {topic.timing.text}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  )
}

type Sort = 'order' | 'needs-work'

type TopicsListProps = {
  courseId: string
  topics: ListTopic[]
  summary: string
  generation: GenerationState
  /** When this page was rendered, in ms, so "Needs work" can tell what is due. */
  now: number
}

/** Confirmed topics: progress, the study path, mastery and review timing, with a sort. */
export function TopicsList({ courseId, topics, summary, generation, now }: TopicsListProps) {
  const [sort, setSort] = React.useState<Sort>('order')
  const ordered = sort === 'order' ? topics : needsWorkOrder(topics, now)
  const building = generation.activeJobs > 0 || generation.failures.length > 0

  return (
    <>
      <PageIntro
        title="Topics"
        description={summary}
        actions={
          <Button asChild variant="secondary" icon={<PencilSimple />}>
            <Link href={`/courses/${courseId}/topics?edit=1`}>Edit topics</Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        {building ? <BuildingContent courseId={courseId} generation={generation} /> : null}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-end gap-3">
            <span id="sort-label" className="text-small text-fg-2">
              Sort by
            </span>
            <SegmentedControl
              aria-labelledby="sort-label"
              value={sort}
              onValueChange={setSort}
              options={[
                { value: 'order', label: 'Course order' },
                { value: 'needs-work', label: 'Needs work' },
              ]}
            />
          </div>
          <ul aria-label="Topics" className="divide-y divide-border border-y border-border">
            {ordered.map((topic) => (
              <TopicRowItem key={topic.id} courseId={courseId} topic={topic} />
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
