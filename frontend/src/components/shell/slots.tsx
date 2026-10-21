'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

export type Crumb = { label: string; href?: string }

type SlotName = 'actions' | 'status' | 'title'

type SlotsValue = {
  targets: Record<SlotName, HTMLElement | null>
  setTarget: (name: SlotName, element: HTMLElement | null) => void
  /** Breadcrumbs a page set itself, replacing the ones worked out from the URL. */
  crumbs: Crumb[] | null
  setCrumbs: (crumbs: Crumb[] | null) => void
  /** Asked before the focus layout's Exit link navigates; returning false stops it. */
  exitGuard: React.RefObject<(() => boolean) | null>
}

const SlotsContext = React.createContext<SlotsValue | null>(null)

export function SlotsProvider({ children }: { children: React.ReactNode }) {
  const [targets, setTargets] = React.useState<Record<SlotName, HTMLElement | null>>({
    actions: null,
    status: null,
    title: null,
  })
  const [crumbs, setCrumbs] = React.useState<Crumb[] | null>(null)
  const exitGuard = React.useRef<(() => boolean) | null>(null)

  const setTarget = React.useCallback((name: SlotName, element: HTMLElement | null) => {
    setTargets((current) => (current[name] === element ? current : { ...current, [name]: element }))
  }, [])

  const value = React.useMemo(
    () => ({ targets, setTarget, crumbs, setCrumbs, exitGuard }),
    [targets, setTarget, crumbs]
  )
  return <SlotsContext.Provider value={value}>{children}</SlotsContext.Provider>
}

export function useSlots(): SlotsValue {
  const value = React.useContext(SlotsContext)
  if (!value) throw new Error('useSlots must be used inside a SlotsProvider')
  return value
}

/** A place in a top bar where pages can put things. Rendered by the bar, filled by PageHeader. */
export function SlotTarget({ name, className }: { name: SlotName; className?: string }) {
  const { setTarget } = useSlots()
  const ref = React.useCallback((element: HTMLDivElement | null) => setTarget(name, element), [name, setTarget])
  return <div ref={ref} className={className} />
}

/**
 * What a page tells the top bar: its actions (a primary button, a secondary one, an overflow
 * menu) and, when the URL alone cannot name it, its breadcrumbs. Render it anywhere in a page;
 * it draws nothing in place.
 *
 *   <PageHeader crumbs={[{ label: 'Mock exams', href: '...' }, { label: exam.name }]}
 *               actions={<Button>New mock exam</Button>} />
 */
export function PageHeader({ crumbs, actions }: { crumbs?: Crumb[]; actions?: React.ReactNode }) {
  const { targets, setCrumbs } = useSlots()
  const crumbsKey = crumbs ? JSON.stringify(crumbs) : ''

  React.useEffect(() => {
    setCrumbs(crumbsKey ? (JSON.parse(crumbsKey) as Crumb[]) : null)
    return () => setCrumbs(null)
  }, [crumbsKey, setCrumbs])

  return actions && targets.actions ? createPortal(actions, targets.actions) : null
}

/** Focus layout version: a title, a status (timer, save state) and actions. */
export function FocusHeader({
  title,
  status,
  actions,
}: {
  title?: React.ReactNode
  status?: React.ReactNode
  actions?: React.ReactNode
}) {
  const { targets } = useSlots()
  return (
    <>
      {title && targets.title ? createPortal(title, targets.title) : null}
      {status && targets.status ? createPortal(status, targets.status) : null}
      {actions && targets.actions ? createPortal(actions, targets.actions) : null}
    </>
  )
}

/**
 * Lets a focus page confirm before the Exit link leaves it. The guard returns true to let the
 * navigation go ahead, or false to stop it (and, for example, open a confirm dialog).
 */
export function useFocusExitGuard(guard: (() => boolean) | null) {
  const { exitGuard: exitGuardRef } = useSlots()
  React.useEffect(() => {
    exitGuardRef.current = guard
    return () => {
      exitGuardRef.current = null
    }
  }, [exitGuardRef, guard])
}
