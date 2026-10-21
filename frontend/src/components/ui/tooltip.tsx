'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
import { Kbd } from './kbd'

/** Mount once near the root. 400ms before a tooltip opens, none between neighbours. */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

type TooltipProps = {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** A shortcut shown after the text. */
  shortcut?: string
  disabled?: boolean
  className?: string
}

/** For icon buttons and truncated text only. */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  shortcut,
  disabled,
  className,
}: TooltipProps) {
  if (disabled || content === null || content === undefined || content === '') return children
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-popper flex max-w-[280px] items-center gap-2 rounded-chip bg-inverse px-2 py-1 text-caption text-inverse-fg',
            'origin-(--radix-tooltip-content-transform-origin)',
            'data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-fade-in data-[state=closed]:animate-pop-out',
            className
          )}
        >
          {content}
          {shortcut ? (
            <Kbd className="border-inverse-fg/25 bg-transparent text-inverse-fg/80">{shortcut}</Kbd>
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
