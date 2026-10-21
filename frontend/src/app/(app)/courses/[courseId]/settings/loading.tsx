import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <Page width="narrow" className="pt-8">
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-48 rounded-chip" />
        <Skeleton className="mt-2.5 h-4 w-64 rounded-chip" />
        <div className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24 rounded-chip" />
            <Skeleton className="h-[34px]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32 rounded-chip" />
            <Skeleton className="h-[92px]" />
          </div>
          <Skeleton className="h-[34px] w-32" />
        </div>
      </div>
    </Page>
  )
}
