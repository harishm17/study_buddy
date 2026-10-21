'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowsClockwise,
  ArrowUp,
  DotsSixVertical,
  DotsThree,
  Files,
  GitMerge,
  ListBullets,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/shell/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Input } from '@/components/ui/input'
import { JobStatus } from '@/components/ui/job-status'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toaster'
import { Tooltip } from '@/components/ui/tooltip'
import { apiFetch, isApiError } from '@/lib/api/client'
import { pluralize } from '@/lib/format'
import { moveInOrder } from '@/lib/topics/ordering'
import { cn } from '@/lib/utils'
import type { JobRef, TopicRow } from '@/server/queries/course'
import { useExtraction } from './extraction'

type EditorTopic = Pick<TopicRow, 'id' | 'name' | 'description' | 'keywords' | 'orderIndex' | 'confirmed'>

const byOrder = (topics: EditorTopic[]) => [...topics].sort((a, b) => a.orderIndex - b.orderIndex)

type TopicEditorProps = {
  courseId: string
  topics: EditorTopic[]
  extractJob: JobRef | null
  extractFailure: string | null
  filesReady: number
  filesProcessing: number
  /** Every topic is confirmed: the editor was opened with ?edit=1. */
  allConfirmed: boolean
}

function Keywords({ keywords }: { keywords: string[] }) {
  if (keywords.length === 0) return null
  const shown = keywords.slice(0, 3)
  const rest = keywords.slice(3)
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((keyword) => (
        <Badge key={keyword} className="max-w-[160px] truncate">
          {keyword}
        </Badge>
      ))}
      {rest.length > 0 ? (
        <Tooltip content={rest.join(', ')}>
          <Badge tabIndex={0} className="cursor-default">{`+${rest.length}`}</Badge>
        </Tooltip>
      ) : null}
    </span>
  )
}

type RowProps = {
  topic: EditorTopic
  index: number
  total: number
  others: EditorTopic[]
  editing: boolean
  dragging: boolean
  indicator: 'before' | 'after' | null
  armed: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (name: string, description: string) => void
  onMove: (to: number) => void
  onMerge: (target: EditorTopic) => void
  onDelete: () => void
  onArm: (armed: boolean) => void
  onDragStart: (event: React.DragEvent) => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
  onDragEnd: () => void
}

function EditFields({
  topic,
  onSave,
  onCancel,
}: {
  topic: EditorTopic
  onSave: (name: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = React.useState(topic.name)
  const [description, setDescription] = React.useState(topic.description ?? '')
  const formRef = React.useRef<HTMLDivElement>(null)
  const finished = React.useRef(false)

  function commit() {
    if (finished.current) return
    finished.current = true
    onSave(name, description)
  }
  function cancel() {
    if (finished.current) return
    finished.current = true
    onCancel()
  }
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
  }

  return (
    <div
      ref={formRef}
      className="flex flex-col gap-2"
      onBlur={(event) => {
        if (!formRef.current?.contains(event.relatedTarget as Node | null)) commit()
      }}
    >
      <Input
        autoFocus
        aria-label="Topic name"
        maxLength={255}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={keys}
      />
      <Input
        aria-label="Description"
        placeholder="Description (optional)"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={keys}
      />
    </div>
  )
}

function TopicEditorRow({
  topic,
  index,
  total,
  others,
  editing,
  dragging,
  indicator,
  armed,
  onStartEdit,
  onCancelEdit,
  onSave,
  onMove,
  onMerge,
  onDelete,
  onArm,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RowProps) {
  const renameRequested = React.useRef(false)

  function onHandleKey(event: React.KeyboardEvent) {
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault()
      onMove(index - 1)
    } else if (event.key === 'ArrowDown' && index < total - 1) {
      event.preventDefault()
      onMove(index + 1)
    }
  }

  return (
    <li
      draggable={armed}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn('relative flex items-start gap-2 py-3 max-sm:gap-1.5', dragging && 'opacity-40')}
    >
      {indicator ? (
        <span
          aria-hidden="true"
          className={cn('absolute inset-x-0 h-0.5 rounded-full bg-accent', indicator === 'before' ? '-top-px' : '-bottom-px')}
        />
      ) : null}
      <button
        type="button"
        data-handle={topic.id}
        aria-label={`Reorder ${topic.name}. Use the up and down arrow keys to move it.`}
        onKeyDown={onHandleKey}
        onPointerDown={() => onArm(true)}
        onPointerUp={() => onArm(false)}
        className="mt-0.5 inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-chip text-fg-3 hover:bg-surface-2 hover:text-fg active:cursor-grabbing max-sm:size-8"
      >
        <DotsSixVertical aria-hidden="true" weight="bold" className="size-4" />
      </button>
      <span className="mt-0.5 w-6 shrink-0 text-right text-small tabular text-fg-3">{index + 1}</span>

      <div className="min-w-0 flex-1 pl-1">
        {editing ? (
          <EditFields topic={topic} onSave={onSave} onCancel={onCancelEdit} />
        ) : (
          <>
            <button
              type="button"
              onClick={onStartEdit}
              aria-label={`Rename ${topic.name}`}
              className="block max-w-full truncate rounded-chip text-left text-body-strong text-fg hover:underline"
            >
              {topic.name}
            </button>
            {topic.description ? (
              <p className="mt-0.5 truncate text-small text-fg-2" title={topic.description}>
                {topic.description}
              </p>
            ) : null}
            {topic.keywords.length > 0 ? (
              <div className="mt-1.5">
                <Keywords keywords={topic.keywords} />
              </div>
            ) : null}
          </>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={`Actions for ${topic.name}`} icon={<DotsThree weight="bold" />} size="sm" noTooltip />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[200px]"
          onCloseAutoFocus={(event) => {
            // Rename opens an input that has focus; the menu must not take it back.
            if (renameRequested.current) {
              event.preventDefault()
              renameRequested.current = false
            }
          }}
        >
          <DropdownMenuItem
            icon={<PencilSimple />}
            onSelect={() => {
              renameRequested.current = true
              onStartEdit()
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger icon={<GitMerge />} disabled={others.length === 0}>
              Merge into...
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {others.map((other) => (
                <DropdownMenuItem key={other.id} onSelect={() => onMerge(other)}>
                  {other.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem icon={<ArrowUp />} disabled={index === 0} onSelect={() => onMove(index - 1)}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem icon={<ArrowDown />} disabled={index === total - 1} onSelect={() => onMove(index + 1)}>
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Trash />} destructive onSelect={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function SkeletonRows() {
  return (
    <ul aria-hidden="true" className="divide-y divide-border border-y border-border">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="flex items-start gap-3 py-3.5">
          <Skeleton className="mt-0.5 size-6" />
          <div className="flex-1">
            <Skeleton className="h-4 w-48 max-w-full rounded-chip" />
            <Skeleton className="mt-2 h-3.5 w-80 max-w-full rounded-chip" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * The topic editor: rename, reorder (drag or keyboard), merge, delete, add, find again, and
 * confirm. Changes are applied at once and put back if the server refuses them.
 */
export function TopicEditor({
  courseId,
  topics: serverTopics,
  extractJob,
  extractFailure,
  filesReady,
  filesProcessing,
  allConfirmed,
}: TopicEditorProps) {
  const router = useRouter()
  const extraction = useExtraction(courseId, extractJob)

  const [items, setItems] = React.useState(() => byOrder(serverTopics))
  const [seen, setSeen] = React.useState(serverTopics)
  if (serverTopics !== seen) {
    setSeen(serverTopics)
    setItems(byOrder(serverTopics))
  }

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [armed, setArmed] = React.useState<string | null>(null)
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [overIndex, setOverIndex] = React.useState<number | null>(null)
  const [announcement, setAnnouncement] = React.useState('')
  const [mergePair, setMergePair] = React.useState<{ source: EditorTopic; target: EditorTopic } | null>(null)
  const [deleting, setDeleting] = React.useState<EditorTopic | null>(null)
  const [findAgainOpen, setFindAgainOpen] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const addRef = React.useRef<HTMLInputElement>(null)
  const refocus = React.useRef<string | null>(null)
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())

  // After a keyboard move the list re-renders in the new order; put focus back on the handle.
  React.useEffect(() => {
    if (!refocus.current) return
    document.querySelector<HTMLElement>(`[data-handle="${refocus.current}"]`)?.focus()
    refocus.current = null
  })

  const running = extraction.running

  function move(id: string, to: number, viaKeyboard = false) {
    const ids = items.map((item) => item.id)
    const slots = items.map((item) => item.orderIndex)
    const nextIds = moveInOrder(ids, id, to)
    if (nextIds.every((value, position) => value === ids[position])) return
    const before = items
    const byId = new Map(items.map((item) => [item.id, item]))
    setItems(nextIds.map((value, position) => ({ ...byId.get(value)!, orderIndex: slots[position] })))
    const moved = byId.get(id)!
    setAnnouncement(`Moved ${moved.name} to position ${nextIds.indexOf(id) + 1} of ${items.length}`)
    if (viaKeyboard) refocus.current = id

    // Requests go one after another so quick key presses reach the server in order.
    queue.current = queue.current.then(async () => {
      try {
        await apiFetch(`/api/topics/${id}`, { method: 'PATCH', json: { orderIndex: to } })
        // A refresh that was already on its way (after adding a topic, say) can land after the
        // optimistic move and put the old order back; this one brings the saved order.
        router.refresh()
      } catch {
        setItems(before)
        toast.error("Couldn't move the topic. Try again.")
      }
    })
  }

  async function save(topic: EditorTopic, nameInput: string, descriptionInput: string) {
    setEditingId(null)
    const name = nameInput.trim()
    const description = descriptionInput.trim()
    if (!name || (name === topic.name && description === (topic.description ?? ''))) return
    const before = items
    setItems((current) => current.map((item) => (item.id === topic.id ? { ...item, name, description: description || null } : item)))
    try {
      await apiFetch(`/api/topics/${topic.id}`, { method: 'PATCH', json: { name, description } })
      router.refresh()
    } catch (error) {
      setItems(before)
      toast.error(isApiError(error) && error.status === 400 ? 'Give the topic a name.' : "Couldn't save the change. Try again.")
    }
  }

  async function mergeTopics() {
    if (!mergePair) return
    try {
      await apiFetch(`/api/projects/${courseId}/topics/merge`, {
        method: 'POST',
        json: { sourceTopicId: mergePair.source.id, targetTopicId: mergePair.target.id },
      })
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Couldn't merge the topics. Try again.")
      throw error
    }
    setItems((current) => current.filter((item) => item.id !== mergePair.source.id))
    toast.success(`Merged into ${mergePair.target.name}`)
    router.refresh()
  }

  async function deleteTopic() {
    if (!deleting) return
    try {
      await apiFetch(`/api/topics/${deleting.id}`, { method: 'DELETE' })
    } catch {
      toast.error("Couldn't delete the topic. Try again.")
      throw new Error('delete failed')
    }
    setItems((current) => current.filter((item) => item.id !== deleting.id))
    toast.success('Topic deleted')
    router.refresh()
  }

  async function addTopic(event: React.FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name || adding) return
    setAdding(true)
    try {
      const result = await apiFetch<{ topic: { id: string; name: string; description: string | null; keywords: string[]; orderIndex: number; userConfirmed: boolean } }>(
        `/api/projects/${courseId}/topics`,
        { method: 'POST', json: { name } }
      )
      const topic = result.topic
      setItems((current) => [
        ...current,
        {
          id: topic.id,
          name: topic.name,
          description: topic.description,
          keywords: topic.keywords ?? [],
          orderIndex: topic.orderIndex,
          confirmed: topic.userConfirmed,
        },
      ])
      setNewName('')
      router.refresh()
      addRef.current?.focus()
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Couldn't add the topic. Try again.")
    } finally {
      setAdding(false)
    }
  }

  async function confirmTopics() {
    setConfirming(true)
    try {
      await apiFetch(`/api/projects/${courseId}/topics/confirm`, { method: 'POST' })
      router.push(`/courses/${courseId}`)
      router.refresh()
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Couldn't confirm the topics. Try again.")
      setConfirming(false)
    }
  }

  // Drag and drop (mouse). Touch and keyboard use the handle keys and the row menu.
  function dropAt(position: number) {
    if (!dragId) return
    const from = items.findIndex((item) => item.id === dragId)
    const to = position > from ? position - 1 : position
    if (from !== -1) move(dragId, to)
  }
  function endDrag() {
    setDragId(null)
    setOverIndex(null)
    setArmed(null)
  }

  const title = allConfirmed ? 'Edit topics' : 'Check the topics'
  const description = allConfirmed
    ? 'Rename, reorder, merge or remove topics. Changes save as you go.'
    : 'We found these in your materials. Rename, merge or remove any. You can change them later.'

  return (
    <div className="flex min-h-[calc(100dvh-8.5rem)] flex-col">
      <PageIntro
        title={title}
        description={description}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<ArrowsClockwise />}
              disabled={running || filesReady === 0}
              onClick={() => setFindAgainOpen(true)}
            >
              Find again
            </Button>
            <Button
              variant="secondary"
              icon={<Plus />}
              onClick={() => {
                addRef.current?.scrollIntoView({ block: 'center' })
                addRef.current?.focus()
              }}
            >
              Add topic
            </Button>
          </>
        }
      />

      <div aria-live="assertive" className="sr-only">
        {announcement}
      </div>

      {running || extraction.failed ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-control bg-surface-2 px-3.5 py-3">
            <JobStatus
              job={extraction.job}
              label="Finding topics"
              since={extraction.since}
              timedOut={extraction.timedOut}
              onRetry={extraction.start}
              retrying={extraction.starting}
            />
          </div>
          {running ? <SkeletonRows /> : null}
        </div>
      ) : null}

      {!running && !extraction.failed && extractFailure && items.length === 0 ? (
        <InlineAlert
          tone="danger"
          title="We couldn't find topics"
          action={
            <Button size="sm" variant="secondary" onClick={extraction.start} loading={extraction.starting}>
              Try again
            </Button>
          }
        >
          {extractFailure}
        </InlineAlert>
      ) : null}

      {!running && items.length === 0 && !extractFailure ? (
        <EmptyState
          icon={<ListBullets />}
          title="No topics yet"
          action={
            filesReady > 0 ? (
              <Button variant="primary" onClick={extraction.start} loading={extraction.starting}>
                Find topics
              </Button>
            ) : (
              <Button asChild variant="primary" icon={<Files />}>
                <Link href={`/courses/${courseId}/materials`}>Add materials</Link>
              </Button>
            )
          }
        >
          {filesReady > 0
            ? 'Margins reads your files and suggests a topic list, or add your own below.'
            : filesProcessing > 0
              ? 'Your files are still being read. Topics appear here once they finish.'
              : 'Add lecture notes or past exams, and Margins will suggest the topics.'}
        </EmptyState>
      ) : null}

      {!running && items.length > 0 ? (
        <ul
          aria-label="Topics"
          className="divide-y divide-border border-y border-border"
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverIndex(null)
          }}
        >
          {items.map((topic, index) => (
            <TopicEditorRow
              key={topic.id}
              topic={topic}
              index={index}
              total={items.length}
              others={items.filter((item) => item.id !== topic.id)}
              editing={editingId === topic.id}
              dragging={dragId === topic.id}
              indicator={
                dragId && overIndex === index ? 'before' : dragId && overIndex === items.length && index === items.length - 1 ? 'after' : null
              }
              armed={armed === topic.id}
              onStartEdit={() => setEditingId(topic.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(name, desc) => save(topic, name, desc)}
              onMove={(to) => move(topic.id, to, true)}
              onMerge={(target) => setMergePair({ source: topic, target })}
              onDelete={() => setDeleting(topic)}
              onArm={(value) => setArmed(value ? topic.id : null)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', topic.id)
                setDragId(topic.id)
              }}
              onDragOver={(event) => {
                if (!dragId) return
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                setOverIndex(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0))
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (overIndex !== null) dropAt(overIndex)
                endDrag()
              }}
              onDragEnd={endDrag}
            />
          ))}
        </ul>
      ) : null}

      {!running ? (
        <form onSubmit={addTopic} className="mt-3">
          <Input
            ref={addRef}
            aria-label="Add a topic"
            placeholder="Add a topic"
            icon={<Plus />}
            maxLength={255}
            value={newName}
            disabled={adding}
            onChange={(event) => setNewName(event.target.value)}
            containerClassName="border-dashed"
          />
        </form>
      ) : null}

      <div className="sticky bottom-0 z-sticky -mx-4 -mb-16 mt-auto border-t border-border bg-surface px-4 py-3 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4">
          <p className="text-small tabular text-fg-2">{running ? 'Finding topics' : pluralize(items.length, 'topic')}</p>
          {allConfirmed ? (
            <Button asChild variant="primary">
              <Link href={`/courses/${courseId}/topics`}>Done</Link>
            </Button>
          ) : (
            <Button variant="primary" onClick={confirmTopics} loading={confirming} disabled={items.length === 0 || running}>
              Confirm topics
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={findAgainOpen}
        onOpenChange={setFindAgainOpen}
        title="Find topics again?"
        description="Topics you already confirmed stay."
        confirmLabel="Find again"
        onConfirm={() => extraction.start()}
      />
      <ConfirmDialog
        open={!!mergePair}
        onOpenChange={(open) => !open && setMergePair(null)}
        title={mergePair ? `Merge ${mergePair.source.name} into ${mergePair.target.name}?` : 'Merge topics?'}
        description={mergePair ? `Content and quiz history move to ${mergePair.target.name}.` : undefined}
        confirmLabel="Merge topics"
        onConfirm={mergeTopics}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete topic?'}
        description="Its notes, quizzes and progress are deleted with it."
        confirmLabel="Delete topic"
        destructive
        onConfirm={deleteTopic}
      />
    </div>
  )
}
