import * as React from 'react'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  /** A 20px icon element: icon={<BookOpenText />}. */
  icon: React.ReactNode
  title: string
  /** One or two lines of text, 52 characters wide at most. */
  children?: React.ReactNode
  /** The one primary action. */
  action?: React.ReactNode
  /** A quieter second option, usually a link. */
  secondary?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, children, action, secondary, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-12 text-center', className)}>
      <div
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-card bg-surface-2 text-fg-2 [&>svg]:size-5"
      >
        {icon}
      </div>
      <h2 className="mt-4 text-subheading text-fg">{title}</h2>
      {children ? <div className="mt-1.5 max-w-[52ch] text-small text-fg-2">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
      {secondary ? <div className="mt-3 text-small">{secondary}</div> : null}
    </div>
  )
}
