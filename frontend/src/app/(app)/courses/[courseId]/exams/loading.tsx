import { Page } from '@/components/shell/page'
import { Skeleton } from '@/components/ui/skeleton'

/** The fallback for the exam pages: a title, then a few rows. */
export default function ExamsLoading() {
  return (
    <Page className="pt-8">
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-48 rounded-chip" />
        <Skeleton className="mt-2.5 h-4 w-72 max-w-full rounded-chip" />
        <div className="mt-10 border-t border-border">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-4 border-b border-border py-4">
              <div className="flex-1">
                <Skeleton className="h-4 w-44 rounded-chip" />
                <Skeleton className="mt-2 h-3.5 w-64 max-w-full rounded-chip" />
              </div>
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      </div>
    </Page>
  )
}
