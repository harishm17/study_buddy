import * as React from 'react'
import { Page } from '@/components/shell/page'
import { cn } from '@/lib/utils'
import { Skeleton, SkeletonText } from './skeleton'

/**
 * The one way to build a loading screen. A route's `loading.tsx` is assembled from these parts in
 * the order and at the sizes of the page it stands in for, so the page replaces it without
 * anything moving: the intro is the height of `PageIntro`, a row is the height of a list row, a
 * field is the height of an input. Pieces are decoration (hidden from assistive technology); the
 * wrapper says "Loading" once.
 */

/** The frame: the page container, marked busy and named for assistive technology. */
export function SkeletonPage({
  width,
  className,
  label = 'Loading',
  children,
}: {
  width?: React.ComponentProps<typeof Page>['width']
  className?: string
  label?: string
  children: React.ReactNode
}) {
  return (
    <Page width={width} className={className}>
      <div aria-busy="true" aria-label={label} role="status">
        {children}
      </div>
    </Page>
  )
}

/** A page title (26/32), an optional line under it (14/22) and an optional button, as `PageIntro` draws them. */
export function SkeletonIntro({
  description = true,
  actions,
  className,
}: {
  description?: boolean
  /** Width of the button on the right, in Tailwind width classes (`w-28`); omit for none. */
  actions?: string
  className?: string
}) {
  return (
    <div className={cn('mb-8 flex items-start justify-between gap-x-6', className)} aria-hidden="true">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-48 rounded-chip" />
        {description ? <Skeleton className="mt-1.5 h-[18px] w-72 max-w-full rounded-chip" /> : null}
      </div>
      {actions ? <Skeleton className={cn('h-[34px] shrink-0 max-sm:hidden', actions)} /> : null}
    </div>
  )
}

/** One row of a list: an optional leading mark, a title with a line under it, an optional trailing block. */
export function SkeletonRow({
  lead,
  lines = 2,
  trailing,
  className,
}: {
  lead?: 'ring' | 'icon'
  lines?: 1 | 2
  /** Width classes of a block at the end of the row (`w-16`); omit for none. */
  trailing?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-4 border-b border-border px-2 py-3', lines === 2 ? 'min-h-14' : 'min-h-12', className)} aria-hidden="true">
      {lead === 'ring' ? <Skeleton className="size-7 shrink-0 rounded-full" /> : null}
      {lead === 'icon' ? <Skeleton className="size-5 shrink-0 rounded-chip" /> : null}
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-44 max-w-full rounded-chip" />
        {lines === 2 ? <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full rounded-chip" /> : null}
      </div>
      {trailing ? <Skeleton className={cn('h-7 shrink-0 max-sm:hidden', trailing)} /> : null}
    </div>
  )
}

/** Rows under a hairline, like the lists they stand in for. */
export function SkeletonRows({ count = 4, ...row }: { count?: number } & React.ComponentProps<typeof SkeletonRow>) {
  return (
    <div className="border-t border-border" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow key={index} {...row} />
      ))}
    </div>
  )
}

/** A form field: its label and the box. `height` is the box in px (34 for an input, more for a text area). */
export function SkeletonField({ labelWidth = 'w-24', height = 34 }: { labelWidth?: string; height?: number }) {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      <Skeleton className={cn('h-4 rounded-chip', labelWidth)} />
      <Skeleton className="max-sm:!h-11" style={{ height }} />
    </div>
  )
}

/** A section: its heading (18/26) and what is under it. */
export function SkeletonSection({ headingWidth = 'w-40', children, className }: { headingWidth?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className} aria-hidden="true">
      <Skeleton className={cn('h-[22px] rounded-chip', headingWidth)} />
      <div className="mt-3">{children}</div>
    </section>
  )
}

export { Skeleton, SkeletonText }
