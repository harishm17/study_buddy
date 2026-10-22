import { Skeleton, SkeletonIntro, SkeletonPage, SkeletonRow } from '@/components/ui/page-skeleton'

/** Topics: the intro with Edit topics, the sort control, then units with their topic rows. */
export default function TopicsLoading() {
  return (
    <SkeletonPage>
      <SkeletonIntro actions="w-28" className="mb-4" />
      <div aria-hidden="true" className="mb-1 flex justify-end">
        <Skeleton className="h-[34px] w-60" />
      </div>
      {[2, 2, 1].map((rows, group) => (
        <section key={group} aria-hidden="true" className="mt-4">
          <div className="flex items-center gap-3 px-2 pb-2">
            <Skeleton className="h-[26px] w-52 rounded-chip" />
            <Skeleton className="h-5 w-14 rounded-chip" />
          </div>
          <div className="border-t border-border">
            {Array.from({ length: rows }, (_, index) => (
              <SkeletonRow key={index} lead="ring" trailing="w-40" />
            ))}
          </div>
        </section>
      ))}
    </SkeletonPage>
  )
}
