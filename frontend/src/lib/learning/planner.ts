import { prisma } from '@/lib/db/prisma'
import { computeTopicMastery } from '@/lib/learning/mastery'

export type NextAction = {
  id: string
  type:
    | 'upload_materials'
    | 'extract_topics'
    | 'confirm_topics'
    | 'study_topic'
    | 'review_topic'
    | 'take_quiz'
    | 'voice_drill'
    | 'generate_content'
    | 'take_exam'
  topicId: string | null
  title: string
  reason: string
  priority: number
  etaMinutes: number
}

type TopicSnapshot = {
  id: string
  name: string
  projectId: string
  orderIndex: number
  mastery: number
  progress: {
    notesCompleted: boolean
    examplesCompleted: boolean
    quizCompleted: boolean
    quizScore: number | null
  }
  contentTypes: Set<string>
  reviewDueAt: Date | null
  voiceAttempts: number
}

const REQUIRED_CONTENT = ['section_notes', 'solved_examples', 'interactive_examples', 'topic_quiz']
const STALE_JOB_WINDOW_MS = 6 * 60 * 1000
const PENDING_DISPATCH_STALE_MS = 90 * 1000

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const getJobInputValue = (inputData: unknown, key: string): string | null => {
  if (!isRecord(inputData)) return null
  const value = inputData[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

async function loadTopicSnapshots(userId: string, projectId: string): Promise<TopicSnapshot[]> {
  const topics = await prisma.topic.findMany({
    where: {
      projectId,
      project: { userId },
    },
    include: {
      progress: {
        where: { userId },
        take: 1,
      },
      content: {
        select: { contentType: true },
      },
      reviewSchedules: {
        where: { userId },
        take: 1,
      },
      _count: {
        select: { voiceDrillAttempts: true },
      },
    },
    orderBy: { orderIndex: 'asc' },
  })

  const masteryValues = await Promise.all(
    topics.map((topic) => computeTopicMastery(userId, projectId, topic.id))
  )

  return topics.map((topic, index) => ({
    id: topic.id,
    name: topic.name,
    projectId,
    orderIndex: topic.orderIndex,
    mastery: masteryValues[index].mastery,
    progress: topic.progress[0] || {
      notesCompleted: false,
      examplesCompleted: false,
      quizCompleted: false,
      quizScore: null,
    },
    contentTypes: new Set(topic.content.map((item) => item.contentType)),
    reviewDueAt: topic.reviewSchedules[0]?.dueAt || null,
    voiceAttempts: topic._count.voiceDrillAttempts || 0,
  }))
}

function summarizeTopicNames(topics: Array<{ name: string }>): string {
  if (topics.length === 0) return ''
  if (topics.length === 1) return topics[0].name
  if (topics.length === 2) return `${topics[0].name} and ${topics[1].name}`
  return `${topics[0].name}, ${topics[1].name}, and ${topics.length - 2} more`
}

function describeMissingStudyTracks(topic: TopicSnapshot): string {
  const missing: string[] = []
  if (!topic.progress.notesCompleted) missing.push('Section Notes')
  if (!topic.progress.examplesCompleted) missing.push('Examples')
  if (missing.length === 0) return 'Study tracks are incomplete.'
  if (missing.length === 1) return `${missing[0]} are not completed yet.`
  return `${missing[0]} and ${missing[1]} are not completed yet.`
}

export async function buildNextActionsForProject(
  userId: string,
  projectId: string
): Promise<NextAction[]> {
  const [snapshots, sampleExamCount, project, unconfirmedTopicsCount] = await Promise.all([
    loadTopicSnapshots(userId, projectId),
    prisma.sampleExam.count({
      where: {
        projectId,
        project: { userId },
      },
    }),
    prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      select: {
        status: true,
        _count: {
          select: {
            materials: true,
            topics: true,
          },
        },
      },
    }),
    prisma.topic.count({
      where: {
        projectId,
        project: { userId },
        userConfirmed: false,
      },
    }),
  ])

  if (!project) {
    return []
  }

  if (project._count.materials === 0) {
    return [
      {
        id: `${projectId}-upload-materials`,
        type: 'upload_materials',
        topicId: null,
        title: 'Upload your first study material',
        reason: 'Add at least one supported study file to begin topic extraction and content generation.',
        priority: 0,
        etaMinutes: 5,
      },
    ]
  }

  if (project._count.topics === 0) {
    return [
      {
        id: `${projectId}-extract-topics`,
        type: 'extract_topics',
        topicId: null,
        title: 'Extract and confirm topics',
        reason: 'Generate your topic list from uploaded materials, then confirm it.',
        priority: 0,
        etaMinutes: 8,
      },
    ]
  }

  if (project.status === 'topics_pending' || unconfirmedTopicsCount > 0) {
    return [
      {
        id: `${projectId}-confirm-topics`,
        type: 'confirm_topics',
        topicId: null,
        title: 'Review and confirm topics',
        reason: 'Topics are extracted. Confirm the list before generating content.',
        priority: 0,
        etaMinutes: 6,
      },
    ]
  }

  const now = new Date()
  const actions: NextAction[] = []
  const staleBefore = new Date(Date.now() - STALE_JOB_WINDOW_MS)
  const pendingDispatchBefore = new Date(Date.now() - PENDING_DISPATCH_STALE_MS)

  const activeGenerationJobs = await prisma.processingJob.findMany({
    where: {
      projectId,
      jobType: 'generate_content',
      status: {
        in: ['pending', 'processing'],
      },
    },
    select: {
      status: true,
      createdAt: true,
      startedAt: true,
      inputData: true,
    },
  })

  const activeGenerationKeys = new Set<string>()
  const activeTopicIds = new Set<string>()

  for (const job of activeGenerationJobs) {
    const stale =
      job.createdAt < staleBefore ||
      (job.status === 'pending' && !job.startedAt && job.createdAt < pendingDispatchBefore)
    if (stale) continue
    const topicId = getJobInputValue(job.inputData, 'topicId')
    const contentType = getJobInputValue(job.inputData, 'contentType')
    if (!topicId || !contentType) continue
    activeGenerationKeys.add(`${topicId}:${contentType}`)
    activeTopicIds.add(topicId)
  }

  if (activeGenerationKeys.size > 0) {
    const activeTopicNames = snapshots
      .filter((topic) => activeTopicIds.has(topic.id))
      .map((topic) => ({ name: topic.name }))
    const activeTopicCount = Math.max(activeTopicNames.length, activeTopicIds.size)
    actions.push({
      id: `${projectId}-generate-batch-active`,
      type: 'generate_content',
      topicId: null,
      title: `Generating missing content for ${activeTopicCount} topic${activeTopicCount === 1 ? '' : 's'}`,
      reason:
        activeTopicNames.length > 0
          ? `${activeGenerationKeys.size} core block${activeGenerationKeys.size === 1 ? '' : 's'} running in background across ${summarizeTopicNames(activeTopicNames)}.`
          : `${activeGenerationKeys.size} core block${activeGenerationKeys.size === 1 ? '' : 's'} running in background.`,
      priority: -1,
      etaMinutes: Math.max(2, Math.min(25, Math.ceil(activeGenerationKeys.size * 1.5))),
    })
  }

  const dueTopics = snapshots
    .filter((topic) => topic.reviewDueAt && topic.reviewDueAt <= now)
    .sort((a, b) => {
      const left = a.reviewDueAt ? a.reviewDueAt.getTime() : Number.MAX_SAFE_INTEGER
      const right = b.reviewDueAt ? b.reviewDueAt.getTime() : Number.MAX_SAFE_INTEGER
      return left - right
    })

  if (dueTopics.length > 0) {
    if (dueTopics.length === 1) {
      actions.push({
        id: `${dueTopics[0].id}-review`,
        type: 'review_topic',
        topicId: dueTopics[0].id,
        title: `Review ${dueTopics[0].name}`,
        reason: 'This topic is due for spaced review.',
        priority: 0,
        etaMinutes: 12,
      })
    } else {
      actions.push({
        id: `${projectId}-review-batch`,
        type: 'review_topic',
        topicId: dueTopics[0].id,
        title: `Review ${dueTopics.length} due topics`,
        reason: `${summarizeTopicNames(dueTopics)} are due for spaced review.`,
        priority: 0,
        etaMinutes: Math.min(30, 10 + (dueTopics.length - 1) * 4),
      })
    }
  }

  const dueTopicIds = new Set(dueTopics.map((topic) => topic.id))
  const generationCandidates = snapshots
    .filter((topic) => !dueTopicIds.has(topic.id))
    .map((topic) => ({
      topic,
      missingCount: REQUIRED_CONTENT.filter(
        (contentType) =>
          !topic.contentTypes.has(contentType) &&
          !activeGenerationKeys.has(`${topic.id}:${contentType}`)
      ).length,
    }))
    .filter((entry) => entry.missingCount > 0)
    .sort((a, b) => {
      if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount
      return a.topic.orderIndex - b.topic.orderIndex
    })

  if (generationCandidates.length > 0) {
    const totalMissingBlocks = generationCandidates.reduce((sum, entry) => sum + entry.missingCount, 0)
    if (generationCandidates.length === 1) {
      actions.push({
        id: `${generationCandidates[0].topic.id}-generate`,
        type: 'generate_content',
        topicId: generationCandidates[0].topic.id,
        title: `Generate content for ${generationCandidates[0].topic.name}`,
        reason: `Missing ${generationCandidates[0].missingCount} core content block(s).`,
        priority: 1,
        etaMinutes: 6,
      })
    } else {
      actions.push({
        id: `${projectId}-generate-batch`,
        type: 'generate_content',
        topicId: generationCandidates[0].topic.id,
        title: `Generate missing content for ${generationCandidates.length} topics`,
        reason: `${totalMissingBlocks} core blocks are missing across ${summarizeTopicNames(
          generationCandidates.map((entry) => ({ name: entry.topic.name }))
        )}.`,
        priority: 1,
        etaMinutes: Math.min(24, 8 + generationCandidates.length * 2),
      })
    }
  }

  const generationTopicIds = new Set(generationCandidates.map((entry) => entry.topic.id))
  const studyTopics = snapshots
    .filter((topic) => !dueTopicIds.has(topic.id) && !generationTopicIds.has(topic.id))
    .filter((topic) => !topic.progress.notesCompleted || !topic.progress.examplesCompleted)
    .sort((a, b) => a.orderIndex - b.orderIndex)

  if (studyTopics.length > 0) {
    if (studyTopics.length === 1) {
      actions.push({
        id: `${studyTopics[0].id}-study`,
        type: 'study_topic',
        topicId: studyTopics[0].id,
        title: `Study next topic: ${studyTopics[0].name}`,
        reason: describeMissingStudyTracks(studyTopics[0]),
        priority: 2,
        etaMinutes: 18,
      })
    } else {
      actions.push({
        id: `${projectId}-study-batch`,
        type: 'study_topic',
        topicId: studyTopics[0].id,
        title: `Continue studying ${studyTopics.length} topics`,
        reason: `Start with ${studyTopics[0].name}, then continue with ${summarizeTopicNames(
          studyTopics.slice(1).map((topic) => ({ name: topic.name }))
        )}.`,
        priority: 2,
        etaMinutes: Math.min(40, 14 + studyTopics.length * 4),
      })
    }
  }

  const studyTopicIds = new Set(studyTopics.map((topic) => topic.id))
  const quizTopics = snapshots
    .filter(
      (topic) =>
        !dueTopicIds.has(topic.id) &&
        !generationTopicIds.has(topic.id) &&
        !studyTopicIds.has(topic.id)
    )
    .filter((topic) => topic.progress.notesCompleted && topic.progress.examplesCompleted)
    .filter((topic) => !topic.progress.quizCompleted || (topic.progress.quizScore ?? 0) < 70)
    .sort((a, b) => {
      const leftScore = a.progress.quizScore ?? 0
      const rightScore = b.progress.quizScore ?? 0
      if (leftScore !== rightScore) return leftScore - rightScore
      if (a.mastery !== b.mastery) return a.mastery - b.mastery
      return a.orderIndex - b.orderIndex
    })

  if (quizTopics.length > 0) {
    if (quizTopics.length === 1) {
      actions.push({
        id: `${quizTopics[0].id}-quiz`,
        type: 'take_quiz',
        topicId: quizTopics[0].id,
        title: `Take a quiz on ${quizTopics[0].name}`,
        reason: 'Quiz mastery is incomplete or below target.',
        priority: 3,
        etaMinutes: 15,
      })
    } else {
      actions.push({
        id: `${projectId}-quiz-batch`,
        type: 'take_quiz',
        topicId: quizTopics[0].id,
        title: `Take quizzes for ${quizTopics.length} topics`,
        reason: `${summarizeTopicNames(quizTopics)} are below quiz mastery target.`,
        priority: 3,
        etaMinutes: Math.min(35, 12 + quizTopics.length * 4),
      })
    }
  }

  const quizTopicIds = new Set(quizTopics.map((topic) => topic.id))
  const voiceTopics = snapshots
    .filter((topic) => !dueTopicIds.has(topic.id) && !generationTopicIds.has(topic.id) && !quizTopicIds.has(topic.id))
    .filter((topic) => topic.voiceAttempts < 3 || topic.mastery < 0.6)
    .sort((a, b) => {
      if (a.mastery !== b.mastery) return a.mastery - b.mastery
      if (a.voiceAttempts !== b.voiceAttempts) return a.voiceAttempts - b.voiceAttempts
      return a.orderIndex - b.orderIndex
    })

  if (voiceTopics.length > 0) {
    if (voiceTopics.length === 1) {
      actions.push({
        id: `${voiceTopics[0].id}-voice`,
        type: 'voice_drill',
        topicId: voiceTopics[0].id,
        title: `Run a voice coach session for ${voiceTopics[0].name}`,
        reason: 'Voice recall practice will improve conceptual fluency.',
        priority: 4,
        etaMinutes: 10,
      })
    } else {
      actions.push({
        id: `${projectId}-voice-batch`,
        type: 'voice_drill',
        topicId: voiceTopics[0].id,
        title: `Run voice coach sessions for ${voiceTopics.length} topics`,
        reason: `${summarizeTopicNames(voiceTopics)} can improve through oral retrieval practice.`,
        priority: 4,
        etaMinutes: Math.min(30, 10 + voiceTopics.length * 3),
      })
    }
  }

  if (sampleExamCount > 0) {
    actions.push({
      id: `${projectId}-exam`,
      type: 'take_exam',
      topicId: null,
      title: 'Take a timed sample exam',
      reason: 'Consolidate progress with mixed-topic timed practice.',
      priority: 5,
      etaMinutes: 45,
    })
  }

  if (actions.length === 0) {
    actions.push({
      id: `${projectId}-exam-build`,
      type: 'take_exam',
      topicId: null,
      title: 'Generate a timed sample exam',
      reason: 'You are caught up on topic practice. Use mixed-topic timed practice next.',
      priority: 5,
      etaMinutes: 20,
    })
  }

  return actions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 8)
}

export async function buildStudyPlanForProject(
  userId: string,
  projectId: string,
  date: Date
) {
  const actions = await buildNextActionsForProject(userId, projectId)
  const start = new Date(date)
  start.setHours(9, 0, 0, 0)

  let cursor = start.getTime()
  return actions.map((action) => {
    const startTime = new Date(cursor)
    const endTime = new Date(cursor + action.etaMinutes * 60 * 1000)
    cursor = endTime.getTime() + 5 * 60 * 1000
    return {
      ...action,
      startAt: startTime.toISOString(),
      endAt: endTime.toISOString(),
    }
  })
}
