'use client'

import * as React from 'react'
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { cn } from '@/lib/utils'
import { floatingSurface, popperMotion } from './styles'

/** Opens on hover after 300ms and on keyboard focus. Touch users tap the trigger. */
export function HoverCard(props: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root openDelay={300} closeDelay={120} {...props} />
}

export const HoverCardTrigger = HoverCardPrimitive.Trigger

export function HoverCardContent({
  className,
  align = 'center',
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          floatingSurface,
          popperMotion,
          'w-[340px] max-w-[calc(100vw-24px)] p-4 text-small',
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}
