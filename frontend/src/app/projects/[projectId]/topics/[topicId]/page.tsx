/**
 * Topic detail page - main learning interface
 * Displays notes, examples, and quizzes for a specific topic
 */

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { TopicLearningInterface } from '@/components/learning/topic-learning-interface'
import { PageShell } from '@/components/ui/page-shell'
import { toPublicContentData, toPublicQuestions } from '@/lib/learning/quiz-questions'

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

  // Fetch the topic with only the columns the page uses.
  const topic = await prisma.topic.findFirst({
    where: {
      id: topicId,
      projectId,
      project: {
        userId: session.user.id,
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      orderIndex: true,
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
        select: {
          id: true,
          contentType: true,
          contentData: true,
          metadata: true,
          createdAt: true,
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
        select: {
          notesCompleted: true,
          examplesCompleted: true,
          quizCompleted: true,
          quizScore: true,
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

  // Quiz answer keys stay on the server until the student submits (see quiz-attempts).
  const publicTopic = {
    ...topic,
    content: topic.content.map((item) => ({
      ...item,
      // The topic_quiz row is a copy of the first quiz set. When quiz sets exist the page
      // uses those, so the copy is not sent.
      contentData:
        item.contentType === 'topic_quiz' && topic.topicQuizzes.length > 0
          ? []
          : toPublicContentData(item.contentType, item.contentData),
    })),
    topicQuizzes: topic.topicQuizzes.map((quiz) => ({
      ...quiz,
      questions: toPublicQuestions(quiz.questions),
    })),
  }

  return (
    <PageShell>
      <TopicLearningInterface
        topic={publicTopic}
        allTopics={allTopics}
        userId={session.user.id}
        initialTab={(resolvedSearchParams?.tab as TopicTab | undefined) ?? null}
      />
    </PageShell>
  )
}
