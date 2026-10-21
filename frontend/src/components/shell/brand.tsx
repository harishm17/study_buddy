import { BookOpenText } from '@phosphor-icons/react/dist/ssr'
import { BRAND_NAME } from '@/config/brand'
import { cn } from '@/lib/utils'

/** The 24px accent tile with the book glyph. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid size-6 shrink-0 place-items-center rounded-[7px] bg-accent text-accent-fg', className)}
    >
      <BookOpenText weight="fill" className="size-3.5" />
    </span>
  )
}

/** Tile and wordmark. `hideWordmark` keeps only the tile (the collapsed rail). */
export function Brand({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark />
      <span className={cn('text-[15px] font-semibold leading-none tracking-[-0.01em] text-fg', wordmarkClassName)}>
        {BRAND_NAME}
      </span>
    </span>
  )
}
