import Link from 'next/link'
import { Brand } from '@/components/shell/brand'
import { SkipLink } from '@/components/shell/skip-link'
import { BRAND_NAME } from '@/config/brand'
import { GITHUB_URL } from '@/config/site'
import { NavActions } from '@/features/marketing/auth-actions'

const footerLink = 'rounded-chip text-fg-2 transition-colors duration-120 hover:text-fg hover:underline'

/** Public pages: a 64px nav, the content, a quiet footer. Fully static; sign in state is a client island. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="rounded-chip">
          <Brand />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <NavActions />
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-border px-4 py-6 text-small md:px-8">
        <Brand />
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/login" className={footerLink}>
            Sign in
          </Link>
          <Link href="/privacy" className={footerLink}>
            Privacy
          </Link>
          <Link href="/terms" className={footerLink}>
            Terms
          </Link>
          <a href={GITHUB_URL} className={footerLink} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <span className="text-fg-2 tabular">{new Date().getFullYear()}</span>
        </nav>
      </footer>
    </div>
  )
}
