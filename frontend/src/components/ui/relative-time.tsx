'use client'

import { formatAgo, formatDueLabel, isOverdue } from '@/lib/format'
import { cn } from '@/lib/utils'

/** "2h ago". The text can differ by a minute between server and browser, which is fine. */
export function RelativeTime({ date, className }: { date: string | Date; className?: string }) {
  const value = typeof date === 'string' ? date : date.toISOString()
  return (
    <time dateTime={value} suppressHydrationWarning className={className}>
      {formatAgo(value)}
    </time>
  )
}

/** "Due today" or "Overdue 2d", in the warning tone. */
export function DueLabel({ dueAt, className }: { dueAt: string; className?: string }) {
  return (
    <span suppressHydrationWarning className={cn('whitespace-nowrap text-warning-soft-fg', className)}>
      {formatDueLabel(dueAt)}
      <span className="sr-only">{isOverdue(dueAt) ? ', overdue' : ''}</span>
    </span>
  )
}
