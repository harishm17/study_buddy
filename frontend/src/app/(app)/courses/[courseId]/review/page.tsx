import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowsClockwise } from '@phosphor-icons/react/dist/ssr'
import { Page, PageIntro } from '@/components/shell/page'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ReviewList } from '@/features/review/review-list'
import { VoiceReview } from '@/features/voice/voice-review'
import { getReviewPageData } from '@/server/queries/review'
import { describeSprintTopics, getSprintTopics } from '@/server/queries/voice'
import { requireUser } from '@/server/session'
import { getTimeZone } from '@/server/timezone'

export const metadata: Metadata = { title: 'Review' }

export default async function ReviewPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser()
  const { courseId } = await params
  const data = await getReviewPageData(user.id, courseId, await getTimeZone())
  if (!data) notFound()
  const sprint = await getSprintTopics(user.id, courseId)

  return (
    <Page>
      <PageIntro title="Review" description="Go over what is due, then practise out loud." />
      {!data.hasTopics ? (
        <EmptyState
          icon={<ArrowsClockwise />}
          title="No topics to review yet"
          action={
            <Button asChild variant="primary">
              <Link href={`/courses/${courseId}/topics`}>Go to topics</Link>
            </Button>
          }
        >
          Reviews start after you take a quiz. Add your materials and confirm the topics first.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-12">
          <ReviewList data={data} />
          {sprint.length > 0 ? (
            <section aria-labelledby="voice-heading">
              <h2 id="voice-heading" className="text-heading text-fg">
                Voice review
              </h2>
              <p className="mt-1 mb-6 text-small text-fg-2">{describeSprintTopics(sprint)}</p>
              <VoiceReview courseId={courseId} mode="sprint" />
            </section>
          ) : null}
        </div>
      )}
    </Page>
  )
}
