'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type TabItem = {
  id: string
  label: React.ReactNode
  href: string
  /** A trailing status glyph: a check, "2/5", a score, a spinner. */
  glyph?: React.ReactNode
}

type TabsProps = {
  items: TabItem[]
  activeId: string
  'aria-label': string
  className?: string
  /** Keep the page position when switching (for ?view= tabs). Default true. */
  scroll?: boolean
}

/**
 * Underline tabs that are links: the active one has aria-current="page". On narrow screens
 * the row scrolls sideways and fades at whichever edge has more to show.
 */
export function Tabs({ items, activeId, className, scroll = false, ...aria }: TabsProps) {
  const rowRef = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ start: false, end: false })

  const measure = React.useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setEdges({
      start: el.scrollLeft > 4,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }, [])

  React.useEffect(() => {
    const el = rowRef.current
    if (!el) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure, items.length])

  React.useEffect(() => {
    rowRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  const mask =
    edges.start && edges.end
      ? 'linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), transparent)'
      : edges.start
        ? 'linear-gradient(to right, transparent, #000 28px)'
        : edges.end
          ? 'linear-gradient(to left, transparent, #000 28px)'
          : undefined

  return (
    <nav aria-label={aria['aria-label']} className={className}>
      <div
        ref={rowRef}
        onScroll={measure}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="flex h-[41px] overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const active = item.id === activeId
          return (
            <Link
              key={item.id}
              href={item.href}
              scroll={scroll}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-body-strong text-fg-2 transition-colors duration-120 hover:text-fg',
                active && 'text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent'
              )}
            >
              {item.label}
              {item.glyph ? <span className="inline-flex items-center text-caption text-fg-3">{item.glyph}</span> : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
