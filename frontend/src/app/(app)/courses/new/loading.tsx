import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

export default function NewCourseLoading() {
  return (
    <Page width="narrow" className="pt-8">
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-40 rounded-chip" />
        <div className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24 rounded-chip" />
            <Skeleton className="h-[34px]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32 rounded-chip" />
            <Skeleton className="h-[70px]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-[34px] w-32" />
            <Skeleton className="h-[34px] w-20" />
          </div>
        </div>
      </div>
    </Page>
  )
}
