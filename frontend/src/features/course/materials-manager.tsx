'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowSquareOut,
  CheckCircle,
  DotsThree,
  FileDoc,
  FilePdf,
  FilePpt,
  Files,
  Trash,
  UploadSimple,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/shell/page'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { Progress } from '@/components/ui/progress'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toaster'
import { Tooltip } from '@/components/ui/tooltip'
import { stageLabel } from '@/components/ui/job-status'
import { useJob } from '@/features/jobs/use-job'
import { apiFetch, isApiError } from '@/lib/api/client'
import { formatBytes } from '@/lib/format'
import { UploadAbortedError, uploadMaterial } from '@/lib/uploads/upload-file'
import { cn } from '@/lib/utils'
import type { MaterialRow } from '@/server/queries/course'
import { useRefreshSoon } from './use-refresh-soon'
import {
  ACCEPT_ATTRIBUTE,
  categoryLabel,
  CATEGORY_LABELS,
  fileProblem,
  problemMessage,
} from './summary'

type Category = 'lecture_notes' | 'sample_exams' | 'book_chapters' | 'syllabus'

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as Category[]).map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}))

/** A file this browser is sending, or has sent and the server list does not show yet. */
type LocalUpload = {
  key: string
  filename: string
  size: number
  category: Category
  percent: number
  phase: 'uploading' | 'sent' | 'error'
  error?: string
  materialId?: string
  abort?: AbortController
}

function FileIcon({ filename }: { filename: string }) {
  const lower = filename.toLowerCase()
  const Icon = lower.endsWith('.pdf') ? FilePdf : lower.endsWith('.pptx') ? FilePpt : FileDoc
  return <Icon aria-hidden="true" className="size-5 shrink-0 text-fg-3" />
}

type StatusProps = { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'danger'; icon: React.ReactNode }

function StatusText({ children, tone = 'neutral', icon }: StatusProps) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-small',
        tone === 'danger' ? 'text-danger-soft-fg' : tone === 'accent' ? 'text-fg' : 'text-fg-2'
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

const READY_ICON = <CheckCircle aria-hidden="true" weight="fill" className="size-4 shrink-0 text-accent" />
const FAILED_ICON = <WarningCircle aria-hidden="true" className="size-4 shrink-0 text-danger" />

// ---------------------------------------------------------------------------------------
// Rows

function RowShell({
  filename,
  category,
  size,
  status,
  menu,
}: {
  filename: string
  category: string
  size: number
  status: React.ReactNode
  menu: React.ReactNode
}) {
  return (
    <tr className="min-h-12 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-2 max-md:gap-y-1 max-md:py-3">
      <td className="py-2.5 pr-3 max-md:col-start-1 max-md:row-start-1 max-md:p-0">
        <div className="flex min-w-0 items-center gap-3">
          <FileIcon filename={filename} />
          <div className="min-w-0">
            <p className="truncate text-body-strong text-fg">{filename}</p>
            <p className="truncate text-caption font-normal text-fg-3 md:hidden">
              {categoryLabel(category)}, {formatBytes(size)}
            </p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-small text-fg-2 max-md:hidden">{categoryLabel(category)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-small tabular text-fg-2 max-md:hidden">{formatBytes(size)}</td>
      <td className="min-w-0 px-3 py-2.5 max-md:col-span-2 max-md:row-start-2 max-md:p-0 max-md:pl-8">{status}</td>
      <td className="w-10 py-1.5 pl-3 text-right max-md:col-start-2 max-md:row-start-1 max-md:p-0">{menu}</td>
    </tr>
  )
}

function RowMenu({ filename, children }: { filename: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`Actions for ${filename}`} icon={<DotsThree weight="bold" />} size="sm" noTooltip />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ServerRow({ row, onDeleted }: { row: MaterialRow; onDeleted: () => void }) {
  const refreshSoon = useRefreshSoon()
  const { job: live } = useJob(row.job?.id ?? null, { timeoutMs: 600_000, onSettled: refreshSoon })
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const stage = live?.stage ?? row.job?.stage ?? (row.job?.jobType === 'chunk_material' ? 'chunking' : 'validating')
  const percent = live?.progressPercent ?? row.job?.progressPercent ?? 0

  let status: React.ReactNode
  if (row.status === 'processing') {
    const showPercent = row.job?.jobType === 'chunk_material' && percent > 10 && percent < 100
    status = (
      <div aria-live="polite">
        <StatusText icon={<Spinner className="text-accent" />}>
          {stageLabel(stage, live?.status)}
          {showPercent ? <span className="tabular text-fg-3">{`  ${percent}%`}</span> : null}
        </StatusText>
        {showPercent ? <Progress aria-label="Reading pages" value={percent} className="mt-1.5 max-w-[200px]" /> : null}
      </div>
    )
  } else if (row.status === 'ready') {
    status = <StatusText icon={READY_ICON} tone="accent">Ready</StatusText>
  } else if (row.status === 'unusable') {
    const reason = row.notes?.trim() || 'No readable text found'
    status = (
      <Tooltip content={reason} side="top" align="start">
        <span className="block min-w-0">
          <StatusText icon={<XCircle aria-hidden="true" weight="fill" className="size-4 shrink-0 text-danger" />} tone="danger">
            Not usable: {reason}
          </StatusText>
        </span>
      </Tooltip>
    )
  } else {
    status = (
      <StatusText icon={FAILED_ICON} tone="danger">
        Failed. Remove it and upload again.
      </StatusText>
    )
  }

  async function onDelete() {
    try {
      await apiFetch(`/api/materials/${row.id}`, { method: 'DELETE' })
    } catch {
      toast.error("Couldn't delete the file. Try again.")
      throw new Error('delete failed')
    }
    toast.success('File deleted')
    onDeleted()
  }

  return (
    <>
      <RowShell
        filename={row.filename}
        category={row.category}
        size={row.sizeBytes}
        status={status}
        menu={
          <RowMenu filename={row.filename}>
            <DropdownMenuItem
              icon={<ArrowSquareOut />}
              onSelect={() => window.open(`/api/materials/${row.id}/file`, '_blank', 'noopener')}
            >
              Open file
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<Trash />} destructive onSelect={() => setConfirmOpen(true)}>
              Delete
            </DropdownMenuItem>
          </RowMenu>
        }
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${row.filename}?`}
        description="Topics built from it keep their content."
        confirmLabel="Delete file"
        destructive
        onConfirm={onDelete}
      />
    </>
  )
}

function LocalRow({ upload, onDismiss }: { upload: LocalUpload; onDismiss: () => void }) {
  let status: React.ReactNode
  if (upload.phase === 'uploading') {
    status = (
      <div aria-live="polite">
        <StatusText icon={<Spinner className="text-accent" />}>
          Uploading <span className="tabular text-fg-3">{upload.percent}%</span>
        </StatusText>
        <Progress aria-label={`Uploading ${upload.filename}`} value={upload.percent} className="mt-1.5 max-w-[200px]" />
      </div>
    )
  } else if (upload.phase === 'sent') {
    status = <StatusText icon={<Spinner className="text-accent" />}>{stageLabel('validating')}</StatusText>
  } else {
    status = (
      <StatusText icon={FAILED_ICON} tone="danger">
        {upload.error}
      </StatusText>
    )
  }

  return (
    <RowShell
      filename={upload.filename}
      category={upload.category}
      size={upload.size}
      status={status}
      menu={
        upload.phase === 'sent' ? null : (
          <IconButton
            label={upload.phase === 'uploading' ? `Cancel upload of ${upload.filename}` : `Dismiss ${upload.filename}`}
            icon={<X />}
            size="sm"
            onClick={() => {
              upload.abort?.abort()
              onDismiss()
            }}
          />
        )
      }
    />
  )
}

// ---------------------------------------------------------------------------------------
// Manager

type MaterialsManagerProps = {
  courseId: string
  maxUploadMb: number
  materials: MaterialRow[]
  /** "page" draws the title and the empty state; "inline" is the setup guide's step. */
  variant?: 'page' | 'inline'
  /** Shown between the title and the uploader (topic finding banners). */
  banner?: React.ReactNode
}

/**
 * The uploader and the list of files with their live pipeline status. Used by the Materials
 * page and by step 1 of the setup guide.
 */
export function MaterialsManager({ courseId, maxUploadMb, materials, variant = 'page', banner }: MaterialsManagerProps) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [category, setCategory] = React.useState<Category>('lecture_notes')
  const [dragging, setDragging] = React.useState(false)
  const [uploads, setUploads] = React.useState<LocalUpload[]>([])

  const patchUpload = React.useCallback((key: string, patch: Partial<LocalUpload>) => {
    setUploads((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }, [])
  const removeUpload = React.useCallback((key: string) => {
    setUploads((current) => current.filter((item) => item.key !== key))
  }, [])

  function startUpload(file: File) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const problem = fileProblem(file, maxUploadMb)
    if (problem) {
      setUploads((current) => [
        { key, filename: file.name, size: file.size, category, percent: 0, phase: 'error', error: problemMessage(problem, maxUploadMb) },
        ...current,
      ])
      return
    }
    const abort = new AbortController()
    setUploads((current) => [
      { key, filename: file.name, size: file.size, category, percent: 0, phase: 'uploading', abort },
      ...current,
    ])
    uploadMaterial({
      projectId: courseId,
      category,
      file,
      maxUploadMb,
      signal: abort.signal,
      onProgress: (percent) => patchUpload(key, { percent }),
    })
      .then((result) => {
        patchUpload(key, { phase: 'sent', percent: 100, materialId: result.material.id })
        router.refresh()
      })
      .catch((error: unknown) => {
        if (error instanceof UploadAbortedError) return
        patchUpload(key, { phase: 'error', error: error instanceof Error ? error.message : 'Upload failed. Try again.' })
      })
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return
    Array.from(list).forEach(startUpload)
  }

  const serverIds = new Set(materials.map((row) => row.id))
  const visibleUploads = uploads.filter((item) => !(item.materialId && serverIds.has(item.materialId)))
  const empty = materials.length === 0 && visibleUploads.length === 0
  const inline = variant === 'inline'

  return (
    <div className={cn(!inline && 'flex flex-col gap-6')}>
      {inline ? null : (
        <PageIntro
          className="mb-0"
          title="Materials"
          description="Lecture notes, past exams and book chapters for this course."
          actions={
            <Button variant="primary" icon={<UploadSimple />} onClick={() => inputRef.current?.click()}>
              Upload
            </Button>
          }
        />
      )}
      {banner}

      <div
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
        className={cn(
          'flex min-h-[120px] flex-col items-center justify-center gap-2.5 rounded-card border border-dashed px-4 py-5 text-center',
          'transition-[border-color,background-color] duration-120',
          dragging ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface',
          inline && 'mt-4'
        )}
      >
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-body-strong text-fg">
          <UploadSimple aria-hidden="true" className="size-5 text-fg-3" />
          Drop files here or
          <Button variant="link" className="h-auto px-0 text-body-strong" onClick={() => inputRef.current?.click()}>
            browse
          </Button>
        </p>
        <p className="text-small text-fg-2">PDF, DOCX, PPTX or DOC, up to {maxUploadMb} MB each.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span id={`category-label-${variant}`} className="text-small text-fg-2">
            These are:
          </span>
          <SegmentedControl
            aria-labelledby={`category-label-${variant}`}
            options={CATEGORY_OPTIONS}
            value={category}
            onValueChange={setCategory}
          />
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose files to upload"
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {empty ? (
        inline ? null : (
          <EmptyState className="py-8" icon={<Files />} title="No materials yet">
            Start with your lecture notes, then add past exams if you have them.
          </EmptyState>
        )
      ) : (
        <div className={cn(inline && 'mt-4')}>
          <table className="w-full text-left max-md:block">
            <thead className="max-md:hidden">
              <tr className="border-b border-border text-caption text-fg-3">
                <th scope="col" className="py-2 pr-3 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Type</th>
                <th scope="col" className="px-3 py-2 font-medium">Size</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="w-10 py-2 pl-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block [&>tr+tr]:border-t [&>tr+tr]:border-border">
              {visibleUploads.map((upload) => (
                <LocalRow key={upload.key} upload={upload} onDismiss={() => removeUpload(upload.key)} />
              ))}
              {materials.map((row) => (
                <ServerRow key={row.id} row={row} onDeleted={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
