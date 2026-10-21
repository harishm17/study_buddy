import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import { deriveSetup, type CourseSetup } from '@/lib/course-setup'
import { masteryLevel, type MasteryLevel } from '@/lib/mastery'

/** Everything here is filtered by the user id; an id that is not theirs is simply not found. */

export type CourseListItem = {
  id: string
  name: string
  description: string | null
  status: string
  updatedAt: string
  topicCount: number
  strongCount: number
  /** One level per topic in course order, for the mastery strip. */
  levels: MasteryLevel[]
  setup: CourseSetup
}

export async function listCourses(userId: string): Promise<CourseListItem[]> {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      updatedAt: true,
      _count: { select: { materials: true } },
      topics: {
        orderBy: { orderIndex: 'asc' },
        select: {
          userConfirmed: true,
          _count: { select: { content: true } },
          reviewSchedules: { where: { userId }, take: 1, select: { mastery: true } },
        },
      },
    },
  })

  return projects.map((project) => {
    const levels = project.topics.map((topic) => masteryLevel(topic.reviewSchedules[0]?.mastery))
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      updatedAt: project.updatedAt.toISOString(),
      topicCount: project.topics.length,
      strongCount: levels.filter((level) => level === 'strong').length,
      levels,
      setup: deriveSetup({
        status: project.status,
        materialCount: project._count.materials,
        topicCount: project.topics.length,
        confirmedTopicCount: project.topics.filter((topic) => topic.userConfirmed).length,
        contentBlockCount: project.topics.reduce((sum, topic) => sum + topic._count.content, 0),
      }),
    }
  })
}

export type ShellTopic = {
  id: string
  name: string
  description: string | null
  orderIndex: number
  confirmed: boolean
  /** 0..1 from the review schedule, or null with no signal yet. */
  mastery: number | null
  dueAt: string | null
  progress: { notes: boolean; examples: boolean; quiz: boolean; quizScore: number | null }
  /** The content types that exist: section_notes, solved_examples, interactive_examples, topic_quiz. */
  content: string[]
}

export type CourseShell = {
  id: string
  name: string
  description: string | null
  status: string
  updatedAt: string
  materialCount: number
  setup: CourseSetup
  topics: ShellTopic[]
}

/** A course with its topics, mastery, progress and content presence. Null when it is not theirs. */
export const getCourseShell = cache(async (userId: string, courseId: string): Promise<CourseShell | null> => {
  const project = await prisma.project.findFirst({
    where: { id: courseId, userId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      updatedAt: true,
      _count: { select: { materials: true } },
      topics: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          orderIndex: true,
          userConfirmed: true,
          content: { select: { contentType: true } },
          progress: {
            where: { userId },
            take: 1,
            select: { notesCompleted: true, examplesCompleted: true, quizCompleted: true, quizScore: true },
          },
          reviewSchedules: { where: { userId }, take: 1, select: { mastery: true, dueAt: true } },
        },
      },
    },
  })
  if (!project) return null

  const topics: ShellTopic[] = project.topics.map((topic) => {
    const progress = topic.progress[0]
    const schedule = topic.reviewSchedules[0]
    return {
      id: topic.id,
      name: topic.name,
      description: topic.description,
      orderIndex: topic.orderIndex,
      confirmed: topic.userConfirmed,
      mastery: schedule?.mastery ?? null,
      dueAt: schedule?.dueAt.toISOString() ?? null,
      progress: {
        notes: progress?.notesCompleted ?? false,
        examples: progress?.examplesCompleted ?? false,
        quiz: progress?.quizCompleted ?? false,
        quizScore: progress?.quizScore ?? null,
      },
      content: topic.content.map((item) => item.contentType),
    }
  })

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    updatedAt: project.updatedAt.toISOString(),
    materialCount: project._count.materials,
    setup: deriveSetup({
      status: project.status,
      materialCount: project._count.materials,
      topicCount: topics.length,
      confirmedTopicCount: topics.filter((topic) => topic.confirmed).length,
      contentBlockCount: topics.reduce((sum, topic) => sum + topic.content.length, 0),
    }),
    topics,
  }
})

export type NavTopic = { id: string; name: string; mastery: number | null }

export type NavCourse = {
  id: string
  name: string
  status: string
  updatedAt: string
  /** Topics that are due for review by now. */
  dueCount: number
  /** Topics exist but are not confirmed yet: the sidebar shows a dot on "Topics". */
  needsTopicReview: boolean
  /** The course is past setup, so the sidebar lists its topics. */
  active: boolean
  topics: NavTopic[]
}

/**
 * What the app shell needs on every page: the user's courses (most recent first) with topic
 * names and mastery, for the sidebar, the course switcher and the command palette.
 */
export const getNavIndex = cache(async (userId: string): Promise<NavCourse[]> => {
  const now = new Date()
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      _count: { select: { materials: true } },
      topics: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          name: true,
          userConfirmed: true,
          _count: { select: { content: true } },
          reviewSchedules: { where: { userId }, take: 1, select: { mastery: true, dueAt: true } },
        },
      },
    },
  })

  return projects.map((project) => {
    const confirmed = project.topics.filter((topic) => topic.userConfirmed).length
    const setup = deriveSetup({
      status: project.status,
      materialCount: project._count.materials,
      topicCount: project.topics.length,
      confirmedTopicCount: confirmed,
      contentBlockCount: project.topics.reduce((sum, topic) => sum + topic._count.content, 0),
    })
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      updatedAt: project.updatedAt.toISOString(),
      dueCount: project.topics.filter((topic) => {
        const dueAt = topic.reviewSchedules[0]?.dueAt
        return dueAt && dueAt <= now
      }).length,
      needsTopicReview: project.topics.length > 0 && confirmed < project.topics.length,
      active: setup.mode === 'active',
      topics: project.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        mastery: topic.reviewSchedules[0]?.mastery ?? null,
      })),
    }
  })
})
