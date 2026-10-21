'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import {
  ChatCircleText,
  Exam,
  Files,
  House,
  ListBullets,
  MagnifyingGlass,
  Microphone,
} from '@phosphor-icons/react/dist/ssr'
import { Kbd } from '@/components/ui/kbd'
import { MasteryIndicator } from '@/components/ui/mastery-indicator'
import { Tooltip } from '@/components/ui/tooltip'
import { useIsMac } from '@/lib/hooks/use-is-mac'
import { cn } from '@/lib/utils'
import { AccountMenu } from './account-menu'
import { Brand } from './brand'
import { CourseSwitcher } from './course-switcher'
import { useShell } from './shell-provider'
import { useSidebarCollapsed } from './sidebar-state'

type NavItem = {
  key: string
  label: string
  href: string
  icon: React.ElementType
  active: boolean
  badge?: React.ReactNode
}

function NavLink({ item, rail }: { item: NavItem; rail: boolean }) {
  const Icon = item.icon
  const link = (
    <Link
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      aria-label={rail ? item.label : undefined}
      className={cn(
        'group flex h-[34px] max-lg:h-11 items-center gap-2.5 rounded-control px-2.5 text-body-strong text-fg-2',
        'transition-colors duration-120 hover:bg-surface-2 hover:text-fg',
        'rail:justify-center rail:px-0',
        item.active && 'bg-surface-2 text-fg'
      )}
    >
      <Icon
        aria-hidden="true"
        weight={item.active ? 'fill' : 'regular'}
        className={cn('size-[18px] shrink-0', item.active ? 'text-accent' : 'text-fg-3')}
      />
      <span className="min-w-0 flex-1 truncate rail:hidden">{item.label}</span>
      {item.badge ? <span className="rail:hidden">{item.badge}</span> : null}
    </Link>
  )
  return rail ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

/**
 * Everything in the sidebar. The desktop aside and the mobile sheet both render it; only the
 * desktop one can be a rail (`allowRail`).
 */
export function SidebarContent({ allowRail = false }: { allowRail?: boolean }) {
  const { nav, setPaletteOpen } = useShell()
  const pathname = usePathname()
  const params = useParams<{ courseId?: string; topicId?: string }>()
  const collapsed = useSidebarCollapsed()
  const isMac = useIsMac()
  const rail = allowRail && collapsed

  const course = nav.find((item) => item.id === params.courseId)
  const base = course ? `/courses/${course.id}` : null

  const items: NavItem[] = base
    ? [
        {
          key: 'overview',
          label: 'Overview',
          href: base,
          icon: House,
          active: pathname === base,
          badge:
            course && course.dueCount > 0 ? (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-chip bg-warning-soft px-1.5 text-caption text-warning-soft-fg tabular"
                title={`${course.dueCount} due for review`}
              >
                <span className="sr-only">{course.dueCount} due for review</span>
                <span aria-hidden="true">{course.dueCount}</span>
              </span>
            ) : null,
        },
        {
          key: 'topics',
          label: 'Topics',
          href: `${base}/topics`,
          icon: ListBullets,
          active: pathname === `${base}/topics`,
          badge: course?.needsTopicReview ? (
            <span className="inline-flex items-center" title="Topics need review">
              <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
              <span className="sr-only">Topics need review</span>
            </span>
          ) : null,
        },
        { key: 'materials', label: 'Materials', href: `${base}/materials`, icon: Files, active: pathname.startsWith(`${base}/materials`) },
        { key: 'ask', label: 'Ask', href: `${base}/ask`, icon: ChatCircleText, active: pathname.startsWith(`${base}/ask`) },
        { key: 'exams', label: 'Mock exams', href: `${base}/exams`, icon: Exam, active: pathname.startsWith(`${base}/exams`) },
        { key: 'review', label: 'Voice review', href: `${base}/review`, icon: Microphone, active: pathname.startsWith(`${base}/review`) },
      ]
    : []

  const search = (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      aria-label={rail ? 'Search' : undefined}
      className={cn(
        'flex h-[34px] w-full items-center gap-2.5 rounded-control px-2.5 text-body-strong text-fg-2',
        'transition-colors duration-120 hover:bg-surface-2 hover:text-fg',
        'rail:justify-center rail:px-0'
      )}
    >
      <MagnifyingGlass aria-hidden="true" className="size-[18px] shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-left rail:hidden">Search</span>
      <span className="flex gap-1 rail:hidden" aria-hidden="true">
        <Kbd>{isMac ? 'Cmd' : 'Ctrl'}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center px-4 rail:justify-center rail:px-0">
        <Link href="/home" aria-label="Margins home" className="rounded-chip">
          <Brand wordmarkClassName="rail:hidden" />
        </Link>
      </div>

      <div className="px-3">
        <CourseSwitcher rail={rail} />
      </div>

      {items.length > 0 ? (
        <nav aria-label="Course" className="mt-3 flex flex-col gap-0.5 px-3">
          {items.map((item) => (
            <NavLink key={item.key} item={item} rail={rail} />
          ))}
        </nav>
      ) : (
        <nav aria-label="Courses" className="mt-3 flex flex-col gap-0.5 px-3">
          <NavLink
            rail={rail}
            item={{ key: 'home', label: 'Home', href: '/home', icon: House, active: pathname === '/home' }}
          />
        </nav>
      )}

      {course?.active && course.topics.length > 0 ? (
        <div className="mt-5 flex min-h-0 flex-1 flex-col rail:hidden">
          <h2 className="px-5 pb-1.5 text-caption text-fg-3">Topics</h2>
          <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            {course.topics.map((topic) => {
              const active = params.topicId === topic.id
              return (
                <li key={topic.id}>
                  <Link
                    href={`${base}/topics/${topic.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-8 max-lg:h-11 items-center gap-2.5 rounded-control px-2.5 text-[13.5px] text-fg-2',
                      'transition-colors duration-120 hover:bg-surface-2 hover:text-fg',
                      active && 'bg-surface-2 text-fg'
                    )}
                  >
                    <MasteryIndicator mastery={topic.mastery} variant="ring" />
                    <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex flex-col gap-0.5 border-t border-border p-3">
        {rail ? (
          <Tooltip content="Search" side="right" shortcut={isMac ? 'Cmd K' : 'Ctrl K'}>
            {search}
          </Tooltip>
        ) : (
          search
        )}
        <AccountMenu rail={rail} />
      </div>
    </div>
  )
}

/** The desktop sidebar: 248px, or a 64px rail. Hidden below 1024px (the mobile sheet takes over). */
export function Sidebar() {
  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        'sidebar-desktop sticky top-0 z-sidebar hidden h-dvh shrink-0 border-r border-border bg-surface lg:block',
        'w-(--sidebar-width) [[data-sidebar=collapsed]_&]:w-(--sidebar-rail-width)'
      )}
    >
      <SidebarContent allowRail />
    </aside>
  )
}
