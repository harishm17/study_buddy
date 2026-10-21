'use client'

import { Toaster as Sonner, toast } from 'sonner'
import { useTheme } from 'next-themes'

export { toast }

/** Transient confirmations and failures of background actions. Never for form validation. */
export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      visibleToasts={3}
      duration={4000}
      closeButton={false}
      style={
        {
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--fg)',
          '--normal-border': 'var(--border)',
          '--border-radius': '12px',
          '--success-bg': 'var(--surface)',
          '--success-text': 'var(--fg)',
          '--success-border': 'var(--border)',
          '--error-bg': 'var(--surface)',
          '--error-text': 'var(--danger-soft-fg)',
          '--error-border': 'var(--border)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: '!shadow-float !font-sans !text-small',
          icon: '!text-accent',
        },
      }}
    />
  )
}
