import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Page } from '@/components/shell/page'
import { courseSummary, reviewTiming, studyPath } from '@/features/course/summary'
import { TopicEditor } from '@/features/course/topic-editor'
import { TopicsList } from '@/features/course/topics-list'
import { countMasteryLevels, masteryLevel } from '@/lib/mastery'
import { getTopicsData } from '@/server/queries/course'
import { requireUser } from '@/server/session'

export const metadata: Metadata = { title: 'Topics' }

export default async function TopicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const user = await requireUser()
  const { courseId } = await params
  const { edit } = await searchParams
  const data = await getTopicsData(user.id, courseId)
  if (!data) notFound()

  const editing = data.hasUnconfirmed || edit === '1' || data.topics.length === 0

  if (editing) {
    return (
      <Page>
        <TopicEditor
          courseId={courseId}
          topics={data.topics.map((topic) => ({
            id: topic.id,
            name: topic.name,
            description: topic.description,
            keywords: topic.keywords,
            orderIndex: topic.orderIndex,
            confirmed: topic.confirmed,
          }))}
          extractJob={data.extractJob}
          extractFailure={data.extractFailure}
          filesReady={data.materialsReady}
          filesProcessing={data.materialsProcessing}
          allConfirmed={!data.hasUnconfirmed && data.topics.length > 0}
        />
      </Page>
    )
  }

  // eslint-disable-next-line react-hooks/purity -- a server component: one timestamp per request
  const now = Date.now()
  const counts = countMasteryLevels(data.topics.map((topic) => masteryLevel(topic.mastery)))
  const due = data.topics.filter((topic) => reviewTiming(topic.dueAt, now)?.due).length

  return (
    <Page>
      <TopicsList
        courseId={courseId}
        summary={courseSummary(data.topics.length, counts, due)}
        generation={data.generation}
        now={now}
        units={data.units}
        topics={data.topics.map((topic) => ({
          id: topic.id,
          name: topic.name,
          description: topic.description,
          orderIndex: topic.orderIndex,
          unitId: topic.unitId,
          mastery: topic.mastery,
          dueAt: topic.dueAt,
          timing: reviewTiming(topic.dueAt, now),
          path: studyPath(topic),
        }))}
      />
    </Page>
  )
}
