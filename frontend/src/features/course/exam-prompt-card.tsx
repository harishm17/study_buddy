'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InlineAlert } from '@/components/ui/inline-alert'
import { apiFetch, isApiError } from '@/lib/api/client'

/**
 * "When is your exam?" on the overview until a date is set. Saving plans the days up to it; "Not now"
 * closes the card for good (it is remembered on the course, so it stays closed on every device).
 */
export function ExamPromptCard({ courseId }: { courseId: string }) {
  const router = useRouter()
  const headingId = React.useId()
  const inputId = React.useId()
  const [date, setDate] = React.useState('')
  const [pending, setPending] = React.useState<'save' | 'dismiss' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [hidden, setHidden] = React.useState(false)

  async function patch(body: Record<string, unknown>, which: 'save' | 'dismiss') {
    setPending(which)
    setError(null)
    try {
      await apiFetch(`/api/projects/${courseId}`, { method: 'PATCH', json: body })
      setHidden(true)
      router.refresh()
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : 'Could not save that. Try again.')
      setPending(null)
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!date) {
      setError('Pick the day of your exam first.')
      return
    }
    void patch({ examDate: date }, 'save')
  }

  if (hidden) return null
  return (
    <Card role="region" aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <h2 id={headingId} className="text-heading text-fg">
          When is your exam?
        </h2>
        <p className="mt-1 text-small text-fg-2">Margins plans your days up to it, and tells you if time is short.</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-small font-medium text-fg">
            Exam date
          </label>
          <Input id={inputId} type="date" value={date} onChange={(event) => setDate(event.target.value)} containerClassName="sm:w-52" />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={pending === 'save'} disabled={pending === 'dismiss'}>
            Save date
          </Button>
          <Button
            type="button"
            variant="ghost"
            loading={pending === 'dismiss'}
            disabled={pending === 'save'}
            onClick={() => void patch({ examPromptDismissed: true }, 'dismiss')}
          >
            Not now
          </Button>
        </div>
      </form>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
    </Card>
  )
}
