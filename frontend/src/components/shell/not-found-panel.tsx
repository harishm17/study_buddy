import * as React from 'react'
import Link from 'next/link'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * The body of every not-found page: one title, one primary way back and an optional second one.
 * The public, signed-in and focus layouts each draw it inside their own frame, so the three 404s
 * differ only in where the way back leads.
 */
export function NotFoundPanel({
  body = 'Check the address, or head back and pick up where you left off.',
  action,
  secondary,
  className,
}: {
  body?: React.ReactNode
  action: { href: string; label: string }
  secondary?: { href: string; label: string }
  className?: string
}) {
  return (
    <EmptyState
      className={className}
      as="h1"
      icon={<MagnifyingGlass />}
      title="We couldn't find that page"
      action={
        <Button asChild variant="primary">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      }
      secondary={
        secondary ? (
          <Button asChild variant="link">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        ) : undefined
      }
    >
      {body}
    </EmptyState>
  )
}
