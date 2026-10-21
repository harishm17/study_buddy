import * as React from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Kbd } from './kbd'
import { Spinner } from './spinner'

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-control font-medium select-none',
    'transition-[background-color,border-color,color,transform] duration-120 ease-enter',
    'active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 aria-disabled:opacity-50',
    '[&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
        ghost: 'text-fg hover:bg-surface-2',
        danger: 'bg-danger text-danger-fg hover:bg-danger/90',
        link: 'h-auto rounded-chip p-0 text-accent hover:underline active:scale-100',
      },
      size: {
        sm: 'h-7 gap-1.5 px-2.5 text-small max-sm:h-11',
        md: 'h-[34px] gap-1.5 px-3.5 text-body max-sm:h-11',
        lg: 'h-10 gap-1.5 px-[18px] text-[15px] leading-[22px] max-sm:h-11',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', fullWidth: false },
  }
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Leading icon, passed as an element: icon={<Plus />}. */
    icon?: React.ReactNode
    /** Keyboard hint shown at the end, e.g. "Enter". */
    kbd?: string
    /**
     * Shows a spinner and disables the button. With a leading icon the spinner takes its place;
     * without one it is centred over the label, so the width never changes.
     */
    loading?: boolean
  }

export function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  icon,
  kbd,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  const iconSize = '[&>svg]:size-4'
  const isLink = variant === 'link'

  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? 'button')}
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={asChild && (disabled || loading) ? true : undefined}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading && !icon ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      ) : null}
      {loading && icon ? (
        <Spinner />
      ) : icon ? (
        <span className={cn('inline-flex', iconSize)} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <Slottable>
        {asChild ? (
          children
        ) : (
          <span className={cn('truncate', loading && !icon && 'invisible')}>{children}</span>
        )}
      </Slottable>
      {kbd && !isLink ? <Kbd className="ml-0.5 bg-transparent">{kbd}</Kbd> : null}
    </Comp>
  )
}
