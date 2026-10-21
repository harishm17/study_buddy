'use client'

import * as React from 'react'
import { Flag } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'

type NavigatorProps = {
  total: number
  current: number
  /** Question numbers (0-based) with an answer. */
  answered: ReadonlySet<number>
  flagged: ReadonlySet<number>
  onSelect: (index: number) => void
  className?: string
}

/** A grid of numbered chips: answered fill in, the current one is ringed, flagged ones carry a flag. */
export function ExamNavigator({ total, current, answered, flagged, onSelect, className }: NavigatorProps) {
  const answeredCount = answered.size
  return (
    <div className={className}>
      <ul className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: total }, (_, index) => {
          const isCurrent = index === current
          const isAnswered = answered.has(index)
          const isFlagged = flagged.has(index)
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Question ${index + 1}${isAnswered ? ', answered' : ', not answered'}${isFlagged ? ', flagged' : ''}`}
                className={cn(
                  'relative grid h-9 w-full place-items-center rounded-chip border text-small tabular transition-colors duration-120 max-sm:h-11',
                  isAnswered ? 'border-transparent bg-surface-3 text-fg' : 'border-border-strong bg-surface text-fg-2 hover:bg-surface-2',
                  isCurrent && 'border-accent ring-2 ring-accent/30'
                )}
              >
                {index + 1}
                {isFlagged ? (
                  <Flag
                    weight="fill"
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 size-3.5 rounded-full bg-surface text-warning"
                  />
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-small text-fg-2 tabular">
        {answeredCount} answered{flagged.size > 0 ? `, ${flagged.size} flagged` : ''}
      </p>
    </div>
  )
}
