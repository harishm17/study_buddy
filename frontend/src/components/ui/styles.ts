/** Class strings shared by several primitives, so they stay identical. */

/** Floating surfaces: popover, dropdown, select, hover card. */
export const floatingSurface =
  'z-popper rounded-card border border-border bg-surface text-fg shadow-float'

/** Enter and leave animation for Radix popper content (uses its transform origin variable). */
export const popperMotion =
  'origin-(--radix-popper-transform-origin) data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out'

/** A row in a menu or list box. */
export const menuItem =
  'relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-control px-2.5 py-1.5 text-[13.5px] leading-5 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-3'
