import Link from 'next/link'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import { Page } from '@/components/shell/page'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function AppNotFound() {
  return (
    <Page>
      <EmptyState
        className="py-24"
        icon={<MagnifyingGlass />}
        title="We couldn't find that"
        action={
          <Button asChild variant="primary">
            <Link href="/home">Go to home</Link>
          </Button>
        }
      >
        The page may have moved, or the course may have been deleted.
      </EmptyState>
    </Page>
  )
}
