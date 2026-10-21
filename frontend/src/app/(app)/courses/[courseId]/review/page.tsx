import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Microphone } from '@phosphor-icons/react/dist/ssr'
import { Page, PageIntro } from '@/components/shell/page'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { VoiceReview } from '@/features/voice/voice-review'
import { getCourseShell } from '@/server/queries/courses'
import { describeSprintTopics, getSprintTopics } from '@/server/queries/voice'
import { requireUser } from '@/server/session'

export const metadata: Metadata = { title: 'Voice review' }

export default async function ReviewPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser()
  const { courseId } = await params
  const course = await getCourseShell(user.id, courseId)
  if (!course) notFound()
  const topics = await getSprintTopics(user.id, courseId)

  return (
    <Page>
      <PageIntro
        title="Voice review"
        description={topics.length > 0 ? describeSprintTopics(topics) : 'A short spoken quiz on the topics you need most.'}
      />
      {topics.length === 0 ? (
        <EmptyState
          icon={<Microphone />}
          title="No topics to review yet"
          action={
            <Button asChild variant="primary">
              <Link href={`/courses/${courseId}/topics`}>Go to topics</Link>
            </Button>
          }
        >
          A sprint draws on your weakest topics. Add your materials and confirm the topics first.
        </EmptyState>
      ) : (
        <VoiceReview courseId={courseId} mode="sprint" />
      )}
    </Page>
  )
}
