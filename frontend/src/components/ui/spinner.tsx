import { CircleNotch } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'

/** A 16px spinner. It keeps turning under reduced motion because it carries meaning. */
export function Spinner({ className }: { className?: string }) {
  return (
    <CircleNotch
      aria-hidden="true"
      data-essential-motion
      className={cn('size-4 shrink-0 animate-spin', className)}
    />
  )
}
