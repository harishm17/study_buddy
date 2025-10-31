/**
 * Topic detail page - main learning interface
 * Displays notes, examples, and quizzes for a specific topic
 */

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { TopicLearningInterface } from '@/components/learning/topic-learning-interface'

interface TopicPageProps {
  params: Promise<{
    projectId: string
    topicId: string
  }>
}

export default async function TopicPage({ params }: TopicPageProps) {
  const session = await requireAuth()
  const { projectId, topicId } = await params

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
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <TopicLearningInterface
        topic={topic}
        allTopics={allTopics}
        userId={session.user.id}
      />
    </div>
  )
}
