import { Skeleton } from '@/components/ui/skeleton'

export default function VoiceLoading() {
  return (
    <div aria-busy="true" aria-label="Loading voice practice" className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-8 md:px-6">
      <Skeleton className="h-8 w-48 rounded-chip" />
      <Skeleton className="mt-2.5 h-4 w-96 max-w-full rounded-chip" />
      <div className="mt-8 flex max-w-[560px] flex-col gap-6">
        <Skeleton className="h-6 w-40 rounded-chip" />
        <Skeleton className="h-[34px]" />
        <Skeleton className="h-[34px]" />
        <Skeleton className="h-10 w-44" />
      </div>
    </div>
  )
}
