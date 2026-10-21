import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

export default function PlanLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-24 rounded-chip" />
        <Skeleton className="mt-2.5 h-4 w-80 max-w-full rounded-chip" />
        <div className="mt-8 flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    </Page>
  )
}
