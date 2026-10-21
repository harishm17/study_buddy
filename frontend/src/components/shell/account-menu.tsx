'use client'

import { signOut } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { CaretUpDown, Monitor, Moon, PaintBrush, SignOut, Sun } from '@phosphor-icons/react/dist/ssr'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShell } from './shell-provider'

export function Avatar({ name, email, className }: { name: string | null; email: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-caption text-accent-soft-fg',
        className
      )}
    >
      {initials(name, email)}
    </span>
  )
}

export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
      <DropdownMenuRadioItem value="system">
        <Monitor className="mr-2 inline size-4 align-[-3px] text-fg-3" />
        System
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="light">
        <Sun className="mr-2 inline size-4 align-[-3px] text-fg-3" />
        Light
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon className="mr-2 inline size-4 align-[-3px] text-fg-3" />
        Dark
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  )
}

/** Avatar, name and a menu: email, theme (System, Light, Dark), sign out. */
export function AccountMenu({ rail }: { rail?: boolean }) {
  const { user } = useShell()
  const label = user.name || user.email

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={`Account menu for ${label}`}
        className={cn(
          'flex h-11 w-full items-center gap-2.5 rounded-control px-2 text-left text-body-strong text-fg',
          'transition-colors duration-120 hover:bg-surface-2 data-[state=open]:bg-surface-2',
          'rail:justify-center rail:px-0'
        )}
      >
        <Avatar name={user.name} email={user.email} />
        <span className="min-w-0 flex-1 truncate rail:hidden">{label}</span>
        <CaretUpDown aria-hidden="true" className="size-4 shrink-0 text-fg-3 rail:hidden" />
      </button>
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {rail ? (
        <Tooltip content={label} side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent side="top" align="start" className="min-w-[232px]">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={<PaintBrush />}>Theme</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ThemeMenuItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<SignOut />} onSelect={() => signOut({ callbackUrl: '/login' })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
