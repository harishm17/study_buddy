'use client'

import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from '@phosphor-icons/react/dist/ssr'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'

/**
 * The theme control for pages without the app's account menu: Light, Dark or System. The icon follows the
 * theme class on <html> through CSS, so the server and the browser render the same markup.
 */
export function ThemeSwitch({ align = 'end' }: { align?: 'start' | 'center' | 'end' }) {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label="Theme"
          noTooltip
          icon={
            <>
              <Sun className="dark:hidden" />
              <Moon className="hidden dark:block" />
            </>
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[160px]">
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
