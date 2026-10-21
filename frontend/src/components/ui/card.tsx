import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

type CardProps = React.ComponentProps<'div'> & {
  /** 16px padding instead of 20px. */
  compact?: boolean
  /** Hover and press states for a card that is a link or button. */
  interactive?: boolean
  asChild?: boolean
}

/** A bordered panel. No shadow: shadows are for things that float. */
export function Card({ className, compact, interactive, asChild, ...props }: CardProps) {
  const Comp = asChild ? Slot : 'div'
  return (
    <Comp
      className={cn(
        'rounded-card border border-border bg-surface',
        compact ? 'p-4' : 'p-5',
        interactive &&
          'block cursor-pointer transition-[border-color,background-color,transform] duration-120 ease-enter hover:border-border-strong hover:bg-[color-mix(in_oklab,var(--surface),var(--surface-2)_40%)] active:scale-[0.995]',
        className
      )}
      {...props}
    />
  )
}
