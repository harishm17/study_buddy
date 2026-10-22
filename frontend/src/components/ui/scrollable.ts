'use client'

import * as React from 'react'

/** Wide content scrolls sideways inside the column: display equations, code blocks, tables and, when
 * an inline formula is too wide for the line, the passage itself. A region that scrolls must be
 * reachable and scrollable from the keyboard (WCAG 2.1.1, axe `scrollable-region-focusable`), but a
 * tab stop on every short equation would be noise, so only the ones that overflow get one. */
const SCROLLABLE = '.katex-display, pre, .md-table'
const LABELS: Record<string, string> = { PRE: 'Code, use arrow keys to scroll sideways', DIV: 'Table, use arrow keys to scroll sideways' }

function labelFor(el: HTMLElement, isRoot: boolean): string {
  if (isRoot) return 'Text, use arrow keys to scroll sideways'
  if (el.classList.contains('katex-display')) return 'Equation, use arrow keys to scroll sideways'
  return LABELS[el.tagName] ?? 'Scrollable content'
}

function markScrollable(el: HTMLElement, overflowing: boolean, isRoot = false) {
  if (overflowing) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    if (!el.hasAttribute('role')) el.setAttribute('role', 'group')
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', labelFor(el, isRoot))
    el.dataset.scrollFocus = ''
  } else if (el.dataset.scrollFocus !== undefined) {
    el.removeAttribute('tabindex')
    el.removeAttribute('role')
    el.removeAttribute('aria-label')
    delete el.dataset.scrollFocus
  }
}

export function useScrollableFocus(ref: React.RefObject<HTMLElement | null>, content: unknown) {
  React.useEffect(() => {
    const root = ref.current
    if (!root) return
    const update = () => {
      markScrollable(root, root.scrollWidth > root.clientWidth + 1, true)
      root.querySelectorAll<HTMLElement>(SCROLLABLE).forEach((el) => markScrollable(el, el.scrollWidth > el.clientWidth + 1))
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(root)
    // KaTeX and code are drawn after the first render and its fonts load later; look again.
    const timer = setTimeout(update, 400)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [ref, content])
}
