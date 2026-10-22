'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Check, Monitor, Moon, Sun } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu'
import { menuItem } from './styles'
import { SegmentedControl } from './segmented-control'

export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const satisfies readonly { value: ThemeChoice; label: string; icon: React.ElementType }[]

const subscribe = () => () => {}

/**
 * The student's theme choice (next-themes owns the storage and the class on <html>).
 * `choice` is null on the server and during hydration, so nothing renders a stale state.
 */
export function useThemeChoice(): { choice: ThemeChoice | null; setChoice: (choice: ThemeChoice) => void } {
  const { theme, setTheme } = useTheme()
  const mounted = React.useSyncExternalStore(subscribe, () => true, () => false)
  const choice = mounted ? ((theme as ThemeChoice | undefined) ?? 'system') : null
  return { choice, setChoice: setTheme }
}

/**
 * Light, Dark or System as one control: a segmented radio group with an icon and a word on each
 * option (the words are never dropped, so the state is not carried by an icon alone). Use it
 * anywhere a page has room for it: the public header, a settings page. Inside a dropdown menu
 * use `ThemeMenuRadios`, which has the same options as menu items.
 */
export function ThemeSwitch({ className, fullWidth }: { className?: string; fullWidth?: boolean }) {
  const { choice, setChoice } = useThemeChoice()
  return (
    <SegmentedControl<ThemeChoice>
      aria-label="Theme"
      value={choice ?? ('' as ThemeChoice)}
      onValueChange={setChoice}
      fullWidth={fullWidth}
      className={className}
      options={THEME_OPTIONS.map(({ value, label, icon: Icon }) => ({
        value,
        label: (
          <span className="inline-flex items-center gap-1.5">
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </span>
        ),
      }))}
    />
  )
}

/**
 * The same three choices as a row of menu items, for a dropdown menu: always visible (not behind
 * a submenu), reachable with the arrow keys, and the menu stays open so the page can be seen
 * changing.
 */
export function ThemeMenuRadios({ className }: { className?: string }) {
  const { choice, setChoice } = useThemeChoice()
  return (
    <MenuPrimitive.RadioGroup
      aria-label="Theme"
      value={choice ?? 'system'}
      onValueChange={(next) => setChoice(next as ThemeChoice)}
      className={cn('grid grid-cols-3 gap-1 px-0.5 pb-0.5', className)}
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <MenuPrimitive.RadioItem
          key={value}
          value={value}
          onSelect={(event) => event.preventDefault()}
          className={cn(
            menuItem,
            'min-h-14 flex-col justify-center gap-1 px-1 text-small',
            'data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent-soft-fg'
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
          <MenuPrimitive.ItemIndicator className="absolute right-1 top-1 inline-flex">
            <Check weight="bold" aria-hidden="true" className="size-3 text-accent-soft-fg" />
          </MenuPrimitive.ItemIndicator>
        </MenuPrimitive.RadioItem>
      ))}
    </MenuPrimitive.RadioGroup>
  )
}
