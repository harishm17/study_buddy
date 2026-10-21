import type { Metadata } from 'next'
import { CommandPalette } from '@/components/shell/command-palette'
import { MobileNav } from '@/components/shell/mobile-nav'
import { ShellProvider } from '@/components/shell/shell-provider'
import { ShortcutsDialog } from '@/components/shell/shortcuts-dialog'
import { Sidebar } from '@/components/shell/sidebar'
import { SkipLink } from '@/components/shell/skip-link'
import { Topbar } from '@/components/shell/topbar'
import { getNavIndex } from '@/server/queries/courses'
import { requireUser } from '@/server/session'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Signed-in app: sidebar, top bar, command palette. Signed-out visitors go to /login?next=. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const nav = await getNavIndex(user.id)

  return (
    <ShellProvider user={{ name: user.name, email: user.email }} nav={nav}>
      <SkipLink />
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
      <CommandPalette />
      <ShortcutsDialog />
    </ShellProvider>
  )
}
