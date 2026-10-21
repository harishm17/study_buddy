import { notFound } from 'next/navigation'
import { ComingSoon } from '@/features/courses/coming-soon'
import { getCourseShell } from '@/server/queries/courses'
import { requireUser } from '@/server/session'

type Params = Promise<{ courseId: string; topicId: string }>

async function loadTopic(params: Params) {
  const user = await requireUser()
  const { courseId, topicId } = await params
  const course = await getCourseShell(user.id, courseId)
  return course?.topics.find((topic) => topic.id === topicId) ?? null
}

export async function generateMetadata({ params }: { params: Params }) {
  return { title: (await loadTopic(params))?.name ?? 'Topic' }
}

export default async function TopicPage({ params }: { params: Params }) {
  const topic = await loadTopic(params)
  if (!topic) notFound()
  return <ComingSoon title={topic.name} description={topic.description ?? undefined} />
}
