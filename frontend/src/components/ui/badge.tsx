import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-1.5 text-caption [&>svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-fg-2',
        accent: 'bg-accent-soft text-accent-soft-fg',
        warning: 'bg-warning-soft text-warning-soft-fg',
        danger: 'bg-danger-soft text-danger-soft-fg',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
)

type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    /** A 12px icon element: icon={<Check />}. */
    icon?: React.ReactNode
  }

export function Badge({ className, tone, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {icon}
      {children}
    </span>
  )
}
