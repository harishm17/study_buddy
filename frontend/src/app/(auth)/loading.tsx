import { Skeleton } from '@/components/ui/skeleton'

/** Matches the auth forms: title, line, two fields, button. */
export default function AuthLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48 rounded-chip" />
      <Skeleton className="mt-3 h-4 w-56 rounded-chip" />
      <div className="mt-8 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-12 rounded-chip" />
          <Skeleton className="h-[34px]" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-16 rounded-chip" />
          <Skeleton className="h-[34px]" />
        </div>
        <Skeleton className="h-10" />
      </div>
    </div>
  )
}
