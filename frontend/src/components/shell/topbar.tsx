'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { List, SidebarSimple } from '@phosphor-icons/react/dist/ssr'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'
import { buildCrumbs } from './breadcrumbs'
import { useShell } from './shell-provider'
import { setSidebarCollapsed, useSidebarCollapsed } from './sidebar-state'
import { SlotTarget, useSlots, type Crumb } from './slots'

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return <div className="min-w-0 flex-1" />
  const middle = crumbs.length > 2
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-body">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          const hiddenOnSmall = middle && index > 0 && !last
          return (
            <React.Fragment key={`${index}-${crumb.label}`}>
              {index === 1 && middle ? (
                <li aria-hidden="true" className="flex items-center gap-1.5 text-fg-3 sm:hidden">
                  <span>...</span>
                  <span>/</span>
                </li>
              ) : null}
              <li
                className={cn(
                  'flex min-w-0 items-center gap-1.5',
                  last ? 'shrink' : 'shrink-[3]',
                  hiddenOnSmall && 'max-sm:hidden'
                )}
              >
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="truncate rounded-chip text-fg-3 transition-colors duration-120 hover:text-fg">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={cn('truncate', last ? 'text-body-strong text-fg' : 'text-fg-3')}>
                    {crumb.label}
                  </span>
                )}
                {last ? null : (
                  <span aria-hidden="true" className="text-fg-3">
                    /
                  </span>
                )}
              </li>
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * 56px, sticky. Transparent at the top of the page; once scrolled it gets a blurred canvas
 * background and a bottom hairline. Left: menu or collapse button and breadcrumbs. Right: the
 * page's actions.
 */
export function Topbar() {
  const { nav, setMobileNavOpen } = useShell()
  const { crumbs: override } = useSlots()
  const pathname = usePathname()
  const collapsed = useSidebarCollapsed()
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const crumbs = override ?? buildCrumbs(pathname, nav)

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        'sticky top-0 z-topbar flex h-(--topbar-height) shrink-0 items-center gap-2 border-b border-transparent px-4 md:px-6 lg:px-8',
        'transition-[background-color,border-color,backdrop-filter] duration-180',
        'data-[scrolled]:border-border data-[scrolled]:bg-canvas/80 data-[scrolled]:backdrop-blur-md'
      )}
    >
      <IconButton
        label="Open menu"
        icon={<List />}
        className="-ml-2 lg:hidden"
        onClick={() => setMobileNavOpen(true)}
      />
      <IconButton
        label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        icon={<SidebarSimple />}
        className="-ml-2 hidden lg:inline-flex"
        tooltipSide="bottom"
        onClick={() => setSidebarCollapsed(!collapsed)}
      />
      <Breadcrumbs crumbs={crumbs} />
      <SlotTarget name="actions" className="flex shrink-0 items-center gap-2" />
    </header>
  )
}
