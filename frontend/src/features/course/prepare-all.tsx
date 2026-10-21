'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toaster'
import { apiFetch, isApiError } from '@/lib/api/client'
import { pluralize } from '@/lib/format'

const UNAVAILABLE = "Study content can't be created right now. Try again in a few minutes."

type PrepareResponse = { status: 'queued' | 'already_running' | 'noop' | 'failed'; message: string }

/**
 * "Prepare all topics now": confirms with an estimate, then starts a course-wide run. The server
 * writes one topic at a time in course order and keeps going when this page is closed (see the
 * generate-missing-content route). Nothing else in the app starts content for a whole course.
 */
export function PrepareAllDialog({
  courseId,
  topicCount,
  open,
  onOpenChange,
}: {
  courseId: string
  /** Confirmed topics that still have something to write. */
  topicCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  async function start() {
    try {
      const result = await apiFetch<PrepareResponse>(`/api/projects/${courseId}/generate-missing-content`, {
        method: 'POST',
      })
      if (result.status === 'queued') toast.success('Writing has started. It keeps going if you leave this page.')
      else toast(result.message)
      router.refresh()
    } catch (error) {
      toast.error(isApiError(error) ? (error.status === 503 ? UNAVAILABLE : error.message) : UNAVAILABLE)
      throw error
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Prepare all topics now?"
      description={`This writes notes, worked examples, practice and a quiz for about ${pluralize(topicCount, 'topic')}, one at a time. It uses a large part of today's AI allowance.`}
      confirmLabel="Prepare all topics"
      onConfirm={start}
    />
  )
}
