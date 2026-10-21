import type { Metadata } from 'next'
import { FocusShell } from '@/components/shell/focus-shell'
import { requireUser } from '@/server/session'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Exam taking and other full-screen tasks: signed-in only, no sidebar. */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <FocusShell>{children}</FocusShell>
}
