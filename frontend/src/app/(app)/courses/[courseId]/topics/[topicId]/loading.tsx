import { ViewSkeleton } from '@/features/topic/skeletons'

/** The body of a topic view while it loads, under the header and study path that stay put. */
export default function TopicLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <ViewSkeleton kind="notes" />
    </div>
  )
}
