/**
 * Topic detail page - main learning interface
 * Displays notes, examples, and quizzes for a specific topic
 */

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { TopicLearningInterface } from '@/components/learning/topic-learning-interface'
import { PageShell } from '@/components/ui/page-shell'

type TopicTab =
  | 'notes'
  | 'solved_examples'
  | 'interactive_examples'
  | 'quiz'
  | 'voice_drill'
  | 'generate'

interface TopicPageProps {
  params: Promise<{
    projectId: string
    topicId: string
  }>
  searchParams?: Promise<{
    tab?: string
  }>
}

export default async function TopicPage({ params, searchParams }: TopicPageProps) {
  const session = await requireAuth()
  const { projectId, topicId } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  // Fetch topic with content and progress
  const topic = await prisma.topic.findFirst({
    where: {
      id: topicId,
      projectId,
      project: {
        userId: session.user.id,
      },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      content: {
        orderBy: {
          createdAt: 'desc',
        },
      },
      topicQuizzes: {
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          questions: true,
          createdAt: true,
        },
      },
      progress: {
        where: {
          userId: session.user.id,
        },
      },
    },
  })

  if (!topic) {
    notFound()
  }

  // Fetch all topics for navigation
  const allTopics = await prisma.topic.findMany({
    where: {
      projectId,
    },
    orderBy: {
      orderIndex: 'asc',
    },
    select: {
      id: true,
      name: true,
      orderIndex: true,
      progress: {
        where: {
          userId: session.user.id,
        },
        select: {
          notesCompleted: true,
          examplesCompleted: true,
          quizCompleted: true,
          quizScore: true,
        },
      },
    },
  })

  return (
    <PageShell>
      <TopicLearningInterface
        topic={topic}
        allTopics={allTopics}
        userId={session.user.id}
        initialTab={(resolvedSearchParams?.tab as TopicTab | undefined) ?? null}
      />
    </PageShell>
  )
}
