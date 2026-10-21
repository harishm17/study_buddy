'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CaretLeft, CaretRight, ChatCircleText, DotsThree, PencilSimple } from '@phosphor-icons/react/dist/ssr'
import { PageHeader } from '@/components/shell/slots'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field } from '@/components/ui/field'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { MasteryIndicator } from '@/components/ui/mastery-indicator'
import { DueLabel } from '@/components/ui/relative-time'
import { toast } from '@/components/ui/toaster'
import { apiFetch, isApiError } from '@/lib/api/client'
import { formatDate, formatWeekday } from '@/lib/format'
import { KIND_COPY } from './copy'
import { RegenerateDialog } from './generation-ui'
import { useTopicView } from './use-topic-view'
import { CONTENT_KINDS, type ContentKind } from './types'

export type TopicNeighbourLink = { id: string; name: string }

type TopicHeaderProps = {
  courseId: string
  name: string
  description: string | null
  mastery: number | null
  dueAt: string | null
  /** Days until the review is due, from the server's clock; zero or less means due now. */
  daysUntilDue: number | null
  bestQuiz: number | null
  previous: TopicNeighbourLink | null
  next: TopicNeighbourLink | null
}

/** "Next review Thu" within a week, "Next review Oct 29" after that, "Due today" once it is due. */
function NextReview({ dueAt, daysUntil }: { dueAt: string; daysUntil: number }) {
  if (daysUntil <= 0) return <DueLabel dueAt={dueAt} />
  const due = new Date(dueAt)
  return (
    <span suppressHydrationWarning>
      Next review {daysUntil < 7 ? formatWeekday(due) : formatDate(due)}
    </span>
  )
}

export function TopicHeader({
  courseId,
  name,
  description,
  mastery,
  dueAt,
  daysUntilDue,
  bestQuiz,
  previous,
  next,
}: TopicHeaderProps) {
  const router = useRouter()
  const view = useTopicView()
  const go = (target: TopicNeighbourLink | null) => {
    if (target) router.push(`/courses/${courseId}/topics/${target.id}?view=${view}`)
  }

  return (
    <header className="pb-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-title text-fg">{name}</h1>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label={previous ? `Previous: ${previous.name}` : 'No previous topic'}
            shortcut="["
            icon={<CaretLeft />}
            variant="secondary"
            size="sm"
            disabled={!previous}
            onClick={() => go(previous)}
          />
          <IconButton
            label={next ? `Next: ${next.name}` : 'No next topic'}
            shortcut="]"
            icon={<CaretRight />}
            variant="secondary"
            size="sm"
            disabled={!next}
            onClick={() => go(next)}
          />
        </div>
      </div>
      {description ? <p className="mt-1.5 line-clamp-2 max-w-[68ch] text-body text-fg-2">{description}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-small text-fg-2">
        <MasteryIndicator mastery={mastery} showPercent className="text-small" />
        {bestQuiz !== null ? <span className="tabular">Best quiz {Math.round(bestQuiz)}%</span> : null}
        {dueAt && daysUntilDue !== null ? <NextReview dueAt={dueAt} daysUntil={daysUntilDue} /> : null}
      </div>
    </header>
  )
}

function EditTopicDialog({
  topicId,
  name,
  open,
  onOpenChange,
}: {
  topicId: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [value, setValue] = React.useState(name)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next = value.trim()
    if (!next) {
      setError('Give the topic a name.')
      return
    }
    if (next === name) {
      onOpenChange(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/topics/${topicId}`, { method: 'PATCH', json: { name: next } })
      toast.success('Topic renamed')
      onOpenChange(false)
      router.refresh()
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Couldn't rename the topic. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(name)
          setError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent size="sm">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit topic</DialogTitle>
            <DialogDescription>Rename this topic. Its content and progress stay.</DialogDescription>
          </DialogHeader>
          <Field label="Topic name" error={error}>
            <Input autoComplete="off" maxLength={255} value={value} onChange={(event) => setValue(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The top bar's actions for a topic: "Ask about this" (a link to the Ask page scoped to the
 * topic until the side sheet is wired in) and an overflow menu with regenerate for each kind of
 * content, Ask in full, and rename.
 */
export function TopicActions({ courseId, topicId, name }: { courseId: string; topicId: string; name: string }) {
  const router = useRouter()
  const [regenerate, setRegenerate] = React.useState<ContentKind | null>(null)
  const [editing, setEditing] = React.useState(false)
  const askHref = `/courses/${courseId}/ask?topic=${topicId}`

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button asChild variant="secondary" size="sm" icon={<ChatCircleText />} className="max-sm:hidden">
              <Link href={askHref}>Ask about this</Link>
            </Button>
            <IconButton
              label="Ask about this"
              icon={<ChatCircleText />}
              variant="secondary"
              size="sm"
              className="sm:hidden"
              onClick={() => router.push(askHref)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="More actions" icon={<DotsThree weight="bold" />} size="sm" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {CONTENT_KINDS.map((kind) => (
                  <DropdownMenuItem key={kind} onSelect={() => setRegenerate(kind)}>
                    {KIND_COPY[kind].regenerate}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<ChatCircleText />} onSelect={() => router.push(askHref)}>
                  Open in Ask
                </DropdownMenuItem>
                <DropdownMenuItem icon={<PencilSimple />} onSelect={() => setEditing(true)}>
                  Edit topic
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {regenerate ? (
        <RegenerateDialog
          key={regenerate}
          kind={regenerate}
          open
          onOpenChange={(open) => {
            if (!open) setRegenerate(null)
          }}
        />
      ) : null}
      <EditTopicDialog topicId={topicId} name={name} open={editing} onOpenChange={setEditing} />
    </>
  )
}
