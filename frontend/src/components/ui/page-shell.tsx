import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageShellProps = {
  children: ReactNode
  className?: string
}

type PageHeaderProps = {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageShell({ children, className }: PageShellProps) {
  return <main className={cn('page-shell', className)}>{children}</main>
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('hero-panel', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          {eyebrow ? (
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">{eyebrow}</div>
          ) : null}
          <h1 className="section-title">{title}</h1>
          {description ? <p className="section-subtitle">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
