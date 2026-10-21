import Link from 'next/link'
import { Brand } from '@/components/shell/brand'
import { SkipLink } from '@/components/shell/skip-link'
import { Button } from '@/components/ui/button'
import { BRAND_NAME } from '@/config/brand'
import { getSessionUser } from '@/server/session'

/** Public pages: a 64px nav, the content, a quiet footer. */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="rounded-chip">
          <Brand />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          {user ? (
            <Button asChild variant="primary">
              <Link href="/home">Open {BRAND_NAME}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="primary">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-6 text-small text-fg-2 md:px-8">
        <Brand />
        <p>{new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
