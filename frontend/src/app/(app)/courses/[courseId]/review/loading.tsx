import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

export default function ReviewLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-48 rounded-chip" />
        <Skeleton className="mt-2.5 h-4 w-80 rounded-chip" />
        <div className="mt-8 flex max-w-[560px] flex-col gap-5">
          <Skeleton className="h-6 w-40 rounded-chip" />
          <Skeleton className="h-[34px]" />
          <Skeleton className="h-[34px]" />
          <Skeleton className="h-10 w-44" />
        </div>
      </div>
    </Page>
  )
}
