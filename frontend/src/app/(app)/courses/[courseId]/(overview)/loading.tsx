import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

export default function OverviewLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <Skeleton className="h-8 w-56 rounded-chip" />
            <Skeleton className="mt-2.5 h-4 w-72 max-w-full rounded-chip" />
          </div>
          <div className="flex gap-2 max-sm:hidden">
            <Skeleton className="h-[34px] w-16" />
            <Skeleton className="h-[34px] w-28" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-[236px] rounded-card" />
          <Skeleton className="h-[180px] rounded-card" />
        </div>
        <div>
          <Skeleton className="h-6 w-24 rounded-chip" />
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[130px] rounded-card" />
            ))}
          </div>
        </div>
      </div>
    </Page>
  )
}
