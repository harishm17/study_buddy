import Image from 'next/image'
import Link from 'next/link'
import { Brand } from '@/components/shell/brand'

/**
 * Two columns on desktop: a 480px form column, and a product screenshot on a quiet panel.
 * The screenshots (public/screens/notes-light.png and notes-dark.png) are swapped for the
 * real topic notes page by the design lead.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[480px_1fr]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <Link href="/" className="w-fit rounded-chip" aria-label="Margins home">
          <Brand />
        </Link>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center outline-none">
          <div className="mx-auto w-full max-w-[360px] py-10">{children}</div>
        </main>
      </div>
      <div aria-hidden="true" className="hidden p-4 lg:block">
        <div className="relative h-full overflow-hidden rounded-card bg-surface-2">
          <Image
            src="/screens/notes-light.png"
            alt=""
            width={1600}
            height={1000}
            sizes="(min-width: 1024px) 1100px, 0px"
            className="absolute left-14 top-14 max-w-none rounded-card border border-border shadow-float dark:hidden"
            style={{ width: 1100, height: 'auto' }}
          />
          <Image
            src="/screens/notes-dark.png"
            alt=""
            width={1600}
            height={1000}
            sizes="(min-width: 1024px) 1100px, 0px"
            className="absolute left-14 top-14 hidden max-w-none rounded-card border border-border shadow-float dark:block"
            style={{ width: 1100, height: 'auto' }}
          />
        </div>
      </div>
    </div>
  )
}
