import { Page } from '@/components/shell/page'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'

/** The fallback while any app page loads: a title and a few blocks. */
export default function AppLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-56 rounded-chip" />
        <Skeleton className="mt-2.5 h-4 w-80 max-w-full rounded-chip" />
        <div className="mt-10 flex flex-col gap-6">
          <Skeleton className="h-28 rounded-card" />
          <SkeletonText lines={4} />
        </div>
      </div>
    </Page>
  )
}
