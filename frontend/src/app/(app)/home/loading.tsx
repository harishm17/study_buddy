import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

/** Matches /home: greeting, continue card, due list, course grid. */
export default function HomeLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <Skeleton className="h-8 w-64 rounded-chip" />
            <Skeleton className="mt-2.5 h-4 w-44 rounded-chip" />
          </div>
          <Skeleton className="h-[34px] w-32" />
        </div>
        <div className="flex flex-col gap-10">
          <Skeleton className="h-[116px] rounded-card" />
          <div>
            <Skeleton className="h-6 w-40 rounded-chip" />
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </div>
          <div>
            <Skeleton className="h-6 w-24 rounded-chip" />
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-[148px] rounded-card" />
              <Skeleton className="h-[148px] rounded-card" />
              <Skeleton className="h-[148px] rounded-card" />
            </div>
          </div>
        </div>
      </div>
    </Page>
  )
}
