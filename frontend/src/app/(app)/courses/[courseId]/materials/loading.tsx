import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

export default function MaterialsLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <Skeleton className="h-8 w-40 rounded-chip" />
            <Skeleton className="mt-2.5 h-4 w-80 max-w-full rounded-chip" />
          </div>
          <Skeleton className="h-[34px] w-24" />
        </div>
        <Skeleton className="h-[120px] rounded-card" />
        <div className="flex flex-col gap-1">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      </div>
    </Page>
  )
}
