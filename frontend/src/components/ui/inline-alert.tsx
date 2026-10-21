import * as React from 'react'
import { CheckCircle, Info, Warning, WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva('flex w-full items-start gap-3 rounded-control px-3.5 py-3', {
  variants: {
    tone: {
      neutral: 'bg-surface-2 text-fg-2',
      accent: 'bg-accent-soft text-accent-soft-fg',
      warning: 'bg-warning-soft text-warning-soft-fg',
      danger: 'bg-danger-soft text-danger-soft-fg',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

const ICONS = {
  neutral: Info,
  accent: CheckCircle,
  warning: Warning,
  danger: WarningCircle,
} as const

type InlineAlertProps = Omit<React.ComponentProps<'div'>, 'title'> &
  VariantProps<typeof alertVariants> & {
    title?: React.ReactNode
    /** An icon element to use instead of the tone's default. */
    icon?: React.ReactNode
    /** A button or link on the right. */
    action?: React.ReactNode
  }

export function InlineAlert({ className, tone = 'neutral', title, icon, action, children, ...props }: InlineAlertProps) {
  const Icon = ICONS[tone ?? 'neutral']
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <span aria-hidden="true" className="mt-0.5 inline-flex shrink-0 [&>svg]:size-4">
        {icon ?? <Icon />}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className={cn('text-body-strong', tone === 'neutral' ? 'text-fg' : 'text-current')}>{title}</p> : null}
        {children ? <div className="text-small">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  )
}
