import Link from 'next/link'
import { Brand } from '@/components/shell/brand'
import { NotFoundPanel } from '@/components/shell/not-found-panel'

export const metadata = { title: 'Page not found' }

/** Public pages and anything outside the signed-in app. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-6 md:px-8">
      <Link href="/" className="w-fit rounded-chip" aria-label="Margins home">
        <Brand />
      </Link>
      <main id="main" className="flex flex-1 items-center justify-center">
        <NotFoundPanel action={{ href: '/home', label: 'Go to home' }} />
      </main>
    </div>
  )
}
