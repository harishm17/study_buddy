import { Skeleton, SkeletonIntro, SkeletonPage, SkeletonRows } from '@/components/ui/page-skeleton'

/** Materials: the intro with Upload, the drop zone, then the file rows. */
export default function MaterialsLoading() {
  return (
    <SkeletonPage>
      <SkeletonIntro actions="w-24" className="mb-6" />
      <Skeleton aria-hidden="true" className="h-[138px] rounded-card" />
      <div className="mt-6">
        <Skeleton aria-hidden="true" className="mb-2 h-4 w-full rounded-chip" />
        <SkeletonRows count={3} lead="icon" lines={1} className="min-h-14" />
      </div>
    </SkeletonPage>
  )
}
