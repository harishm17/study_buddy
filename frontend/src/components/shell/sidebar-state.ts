'use client'

import { useSyncExternalStore } from 'react'
import { SIDEBAR_KEY } from '@/config/sidebar'

/**
 * Whether the desktop sidebar is collapsed to its rail. The truth is `data-sidebar` on <html>
 * (CSS reads it, so the right width is there from first paint); it is persisted in
 * localStorage and restored by SIDEBAR_INIT_SCRIPT (config/sidebar.ts) before the page paints.
 */

const EVENT = 'margins:sidebar-change'

const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.sidebar === 'collapsed',
    () => false
  )
}

export function setSidebarCollapsed(collapsed: boolean) {
  document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded')
  } catch {
    // Private mode: the choice just lasts until the page closes.
  }
  window.dispatchEvent(new Event(EVENT))
}
