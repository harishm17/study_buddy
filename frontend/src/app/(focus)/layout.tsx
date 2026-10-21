import { FocusShell } from '@/components/shell/focus-shell'
import { requireUser } from '@/server/session'

/** Exam taking and other full-screen tasks: signed-in only, no sidebar. */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <FocusShell>{children}</FocusShell>
}
