'use client'

import type { KeyboardEvent, ReactNode } from 'react'

// Helpers for the app's tab bars: a tablist with arrow-key navigation, and the props that tie
// each tab to its panel. Selecting by arrow key clicks the tab, so a tab bar built from
// buttons only needs an onClick that sets the active tab.

export function TabList({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not(:disabled)')
    )
    if (tabs.length === 0) return
    const current = tabs.indexOf(document.activeElement as HTMLElement)
    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    event.preventDefault()
    tabs[next].focus()
    tabs[next].click()
  }

  return (
    <div role="tablist" aria-label={label} className={className} onKeyDown={handleKeyDown}>
      {children}
    </div>
  )
}

const tabId = (idBase: string, id: string) => `${idBase}-tab-${id}`
const panelId = (idBase: string, id: string) => `${idBase}-panel-${id}`

/** Props for one tab button. Only the selected tab is in the tab order. */
export function tabProps(idBase: string, id: string, selected: boolean) {
  return {
    id: tabId(idBase, id),
    role: 'tab' as const,
    type: 'button' as const,
    'aria-selected': selected,
    'aria-controls': panelId(idBase, id),
    tabIndex: selected ? 0 : -1,
  }
}

/** Props for the panel of the selected tab. */
export function tabPanelProps(idBase: string, id: string) {
  return {
    id: panelId(idBase, id),
    role: 'tabpanel' as const,
    'aria-labelledby': tabId(idBase, id),
    tabIndex: 0,
  }
}
