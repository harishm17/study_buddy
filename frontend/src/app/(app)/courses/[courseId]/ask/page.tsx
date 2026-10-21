import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AskPageLazy } from '@/features/ask/ask-page-lazy'
import { countSearchableMaterials, getAskThread, listAskThreads, serverNow } from '@/server/queries/ask'
import { getCourseShell } from '@/server/queries/courses'
import { requireUser } from '@/server/session'

export const metadata: Metadata = { title: 'Ask' }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function AskRoute({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ thread?: string | string[]; topic?: string | string[] }>
}) {
  const user = await requireUser()
  const { courseId } = await params
  const query = await searchParams
  const course = await getCourseShell(user.id, courseId)
  if (!course) notFound()

  const threadId = first(query.thread)
  const topicParam = first(query.topic)
  const topics = course.topics.filter((topic) => topic.confirmed).map((topic) => ({ id: topic.id, name: topic.name }))

  const [threads, initialThread, materialCount] = await Promise.all([
    listAskThreads(user.id, courseId),
    threadId ? getAskThread(user.id, courseId, threadId) : Promise.resolve(null),
    countSearchableMaterials(user.id, courseId),
  ])

  return (
    <AskPageLazy
      courseId={courseId}
      threads={threads}
      initialThread={initialThread}
      topics={topics}
      initialTopicId={topicParam && topics.some((topic) => topic.id === topicParam) ? topicParam : null}
      hasMaterials={materialCount > 0}
      now={serverNow()}
    />
  )
}
