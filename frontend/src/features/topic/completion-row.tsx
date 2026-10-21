'use client'

import Link from 'next/link'
import { ArrowRight, Check } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { InlineAlert } from '@/components/ui/inline-alert'

/**
 * The row after notes or examples: a primary "mark" button, or, once marked, a quiet accent
 * notice with a link to the next view.
 */
export function CompletionRow({
  completed,
  saving,
  markLabel,
  doneText,
  nextHref,
  nextLabel,
  onMark,
}: {
  completed: boolean
  saving: boolean
  markLabel: string
  doneText: string
  nextHref: string
  nextLabel: string
  onMark: () => void
}) {
  return (
    <div className="mt-12 border-t border-border pt-6">
      {completed ? (
        <InlineAlert
          tone="accent"
          action={
            <Button asChild variant="link" className="text-small font-medium">
              <Link href={nextHref} scroll={false}>
                {nextLabel}
                <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          }
        >
          {doneText}
        </InlineAlert>
      ) : (
        <Button variant="primary" icon={<Check />} loading={saving} onClick={onMark}>
          {markLabel}
        </Button>
      )}
    </div>
  )
}
