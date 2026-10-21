import Link from 'next/link'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import { Brand } from '@/components/shell/brand'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-6 md:px-8">
      <Link href="/" className="w-fit rounded-chip" aria-label="Margins home">
        <Brand />
      </Link>
      <main id="main" className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<MagnifyingGlass />}
          title="We couldn't find that page"
          action={
            <Button asChild variant="primary">
              <Link href="/home">Go to home</Link>
            </Button>
          }
        >
          Check the address, or head back and pick up where you left off.
        </EmptyState>
      </main>
    </div>
  )
}
