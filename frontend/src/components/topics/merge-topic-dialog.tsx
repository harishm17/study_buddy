'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type MergeTopicDialogProps = {
  source: { id: string; name: string }
  candidates: Array<{ id: string; name: string }>
  trigger: React.ReactNode
  onMerge: (targetTopicId: string) => Promise<void>
}

/** Pick the topic to merge `source` into. The source is removed; the target keeps its name. */
export function MergeTopicDialog({ source, candidates, trigger, onMerge }: MergeTopicDialogProps) {
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const selectId = `merge-target-${source.id}`

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setTargetId('')
  }

  const handleConfirm = async () => {
    if (!targetId) return
    setSubmitting(true)
    try {
      await onMerge(targetId)
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge topic</DialogTitle>
          <DialogDescription>
            &quot;{source.name}&quot; will be merged into the topic you pick. Its source chunks and any study
            progress move there, and &quot;{source.name}&quot; is removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={selectId} className="text-sm font-medium">
            Merge into
          </label>
          <select
            id={selectId}
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="w-full rounded-xl border border-input/80 bg-white/90 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Choose a topic</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!targetId || submitting}>
            {submitting ? 'Merging...' : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
