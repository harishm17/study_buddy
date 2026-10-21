import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

export default function TopicsLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <Skeleton className="h-8 w-32 rounded-chip" />
            <Skeleton className="mt-2.5 h-4 w-64 max-w-full rounded-chip" />
          </div>
          <Skeleton className="h-[34px] w-28 max-sm:hidden" />
        </div>
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      </div>
    </Page>
  )
}
