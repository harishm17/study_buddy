import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border bg-surface-2 px-1 font-mono text-[11.5px] leading-none text-fg-2',
        className
      )}
      {...props}
    />
  )
}
