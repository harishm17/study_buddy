import { cn } from '@/lib/utils'

/** A placeholder block. Size and radius come from the element it stands in for. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-control bg-surface-2',
        'after:absolute after:inset-0 after:animate-shimmer after:bg-linear-to-r after:from-transparent after:via-surface-3/60 after:to-transparent',
        className
      )}
      {...props}
    />
  )
}

/** Lines of text; the last one is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-3.5 rounded-chip', index === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  )
}
