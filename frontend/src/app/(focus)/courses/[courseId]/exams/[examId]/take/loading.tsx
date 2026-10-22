import { Skeleton } from '@/components/ui/skeleton'

export default function TakeLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the exam" className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6 lg:py-10">
      <Skeleton className="h-4 w-36 rounded-chip" />
      <Skeleton className="mt-3 h-1" />
      <Skeleton className="mt-8 h-6 w-4/5 rounded-chip" />
      <div className="mt-5 flex flex-col gap-2">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-11" />
        ))}
      </div>
    </div>
  )
}
