import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import type { ContentKind } from './types'

/** Stand-ins shaped like each view's final layout, shown while its content is being written. */

function NotesSkeleton() {
  return (
    <div className="flex gap-12" aria-hidden="true">
      <div className="flex min-w-0 max-w-[720px] flex-1 flex-col gap-6">
        <Skeleton className="h-4 w-28 rounded-chip" />
        <Skeleton className="h-7 w-2/5 rounded-chip" />
        <SkeletonText lines={4} />
        <Skeleton className="mt-2 h-7 w-1/3 rounded-chip" />
        <SkeletonText lines={5} />
        <Skeleton className="mt-2 h-7 w-1/2 rounded-chip" />
        <SkeletonText lines={3} />
      </div>
      <div className="hidden w-[220px] shrink-0 flex-col gap-3 min-[1200px]:flex">
        <Skeleton className="h-4 w-24 rounded-chip" />
        <Skeleton className="h-3.5 w-32 rounded-chip" />
        <Skeleton className="h-3.5 w-28 rounded-chip" />
        <Skeleton className="h-3.5 w-36 rounded-chip" />
      </div>
    </div>
  )
}

function ExamplesSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-[68px] rounded-card" />
      ))}
    </div>
  )
}

function PracticeSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-6 w-64 rounded-chip" />
        <Skeleton className="h-8 w-40 rounded-control" />
      </div>
      <SkeletonText lines={2} />
      <Skeleton className="h-16 rounded-card" />
      <Skeleton className="h-28 rounded-card" />
    </div>
  )
}

function QuizSkeleton() {
  return (
    <div className="flex max-w-[720px] flex-col gap-5" aria-hidden="true">
      <Skeleton className="h-7 w-24 rounded-chip" />
      <Skeleton className="h-9 w-64 rounded-control" />
      <SkeletonText lines={2} />
      <Skeleton className="h-9 w-32 rounded-control" />
    </div>
  )
}

export function ViewSkeleton({ kind }: { kind: ContentKind }) {
  switch (kind) {
    case 'notes':
      return <NotesSkeleton />
    case 'examples':
      return <ExamplesSkeleton />
    case 'practice':
      return <PracticeSkeleton />
    default:
      return <QuizSkeleton />
  }
}
