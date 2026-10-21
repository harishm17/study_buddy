import { notFound } from 'next/navigation'
import { Page, PageIntro } from '@/components/shell/page'
import { VoiceReview } from '@/features/voice/voice-review'
import { getCourseShell } from '@/server/queries/courses'
import { requireUser } from '@/server/session'

/**
 * Development harness: the topic-mode voice review on a page of its own, because the topic
 * page wires it in separately. Not available in production builds.
 */
export default async function DevVoiceTopicPage({ params }: { params: Promise<{ courseId: string; topicId: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const user = await requireUser()
  const { courseId, topicId } = await params
  const course = await getCourseShell(user.id, courseId)
  const topic = course?.topics.find((item) => item.id === topicId)
  if (!course || !topic) notFound()

  return (
    <Page width="narrow">
      <PageIntro title={topic.name} description="Topic voice review harness (development only)." />
      <VoiceReview courseId={courseId} mode="topic" topic={{ id: topic.id, name: topic.name }} />
    </Page>
  )
}
