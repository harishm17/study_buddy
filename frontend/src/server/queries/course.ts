import { prisma } from '@/lib/db/prisma'
import { examTitle } from '@/lib/exams/display'
import { buildNextActionsForProject } from '@/lib/learning/planner'
import { ACTIVE_JOB_STATUSES } from '@/lib/jobs/active-jobs'
import {
  contentTypeLabel,
  describeJobFailure,
  pickGenerationFailures,
  type GenerationJobRow,
} from '@/lib/jobs/failure-message'
import { describeNextAction, type DescribedAction } from '@/lib/next-action'
import { maxUploadMb } from '@/lib/storage/upload-limits'
import { courseMastery, masteryLevel, countMasteryLevels, type MasteryCounts } from '@/lib/mastery'
import { getCourseShell, type CourseShell, type ShellTopic } from '@/server/queries/courses'

/**
 * Read models for the course pages: overview (setup guide and Today view), materials and
 * topics. Everything is filtered by the user id; an id that is not theirs is not found.
 */

export const CORE_CONTENT_TYPES = ['section_notes', 'solved_examples', 'interactive_examples', 'topic_quiz'] as const

const STALE_JOB_WINDOW_MS = 6 * 60 * 1000
const PENDING_DISPATCH_STALE_MS = 90 * 1000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** A running job, as the browser needs it to follow it. */
export type JobRef = {
  id: string
  stage: string | null
  progressPercent: number
  createdAt: string
}

type JobRow = {
  id: string
  stage: string | null
  progressPercent: number
  createdAt: Date
}

const toJobRef = (job: JobRow): JobRef => ({
  id: job.id,
  stage: job.stage,
  progressPercent: job.progressPercent,
  createdAt: job.createdAt.toISOString(),
})

// ---------------------------------------------------------------------------------------
// Materials

export type MaterialStatus = 'processing' | 'ready' | 'unusable' | 'failed'

export type MaterialRow = {
  id: string
  filename: string
  category: string
  sizeBytes: number
  status: MaterialStatus
  /** The reason a file is not usable (validationNotes). */
  notes: string | null
  uploadedAt: string
  /** The validate or chunk job to follow while the file is being processed. */
  job: (JobRef & { jobType: string }) | null
}

export type MaterialsData = {
  maxUploadMb: number
  materials: MaterialRow[]
  readyCount: number
  processingCount: number
  /** A topic-finding job that is running now. */
  extractJob: JobRef | null
  /** The latest topic-finding job failed and there are no topics to show for it. */
  extractFailure: string | null
}

export async function getMaterialsData(userId: string, courseId: string): Promise<MaterialsData> {
  const [materials, pipelineJobs, extractJobs, topicCount] = await Promise.all([
    prisma.material.findMany({
      where: { projectId: courseId, project: { userId } },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        filename: true,
        category: true,
        sizeBytes: true,
        validationStatus: true,
        validationNotes: true,
        uploadedAt: true,
      },
    }),
    prisma.processingJob.findMany({
      where: { projectId: courseId, userId, jobType: { in: ['validate_material', 'chunk_material'] } },
      orderBy: { createdAt: 'desc' },
      take: 400,
      select: {
        id: true,
        jobType: true,
        status: true,
        stage: true,
        progressPercent: true,
        createdAt: true,
        inputData: true,
      },
    }),
    prisma.processingJob.findMany({
      where: { projectId: courseId, userId, jobType: 'extract_topics' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, status: true, stage: true, progressPercent: true, createdAt: true, errorCode: true, errorMessage: true },
    }),
    prisma.topic.count({ where: { projectId: courseId, project: { userId } } }),
  ])

  const jobsByMaterial = new Map<string, typeof pipelineJobs>()
  for (const job of pipelineJobs) {
    const materialId = isRecord(job.inputData) && typeof job.inputData.materialId === 'string' ? job.inputData.materialId : null
    if (!materialId) continue
    const list = jobsByMaterial.get(materialId)
    if (list) list.push(job)
    else jobsByMaterial.set(materialId, [job])
  }

  const rows: MaterialRow[] = materials.map((material) => {
    const jobs = jobsByMaterial.get(material.id) ?? []
    // Newest first, so the first active job is the one in front.
    const active = jobs.find((job) => ACTIVE_JOB_STATUSES.includes(job.status))
    const latest = jobs[0]
    let status: MaterialStatus
    if (material.validationStatus === 'invalid') status = 'unusable'
    else if (active) status = 'processing'
    else if (material.validationStatus === 'pending') status = latest?.status === 'completed' ? 'processing' : 'failed'
    else status = latest?.status === 'failed' ? 'failed' : 'ready'

    return {
      id: material.id,
      filename: material.filename,
      category: material.category,
      sizeBytes: Number(material.sizeBytes),
      status,
      notes: material.validationNotes,
      uploadedAt: material.uploadedAt.toISOString(),
      job: active ? { ...toJobRef(active), jobType: active.jobType } : null,
    }
  })

  const activeExtract = extractJobs.find((job) => ACTIVE_JOB_STATUSES.includes(job.status))
  const latestExtract = extractJobs[0]
  return {
    maxUploadMb: maxUploadMb(),
    materials: rows,
    readyCount: rows.filter((row) => row.status === 'ready').length,
    processingCount: rows.filter((row) => row.status === 'processing').length,
    extractJob: activeExtract ? toJobRef(activeExtract) : null,
    extractFailure:
      !activeExtract && topicCount === 0 && latestExtract?.status === 'failed'
        ? describeJobFailure(latestExtract.errorCode, latestExtract.errorMessage)
        : null,
  }
}

// ---------------------------------------------------------------------------------------
// Content generation

export type GenerationFailureRow = {
  jobId: string
  topicId: string
  topicName: string
  contentType: string
  /** "Notes for Hashing couldn't be written. The AI service was busy." */
  message: string
}

export type GenerationState = {
  /** Confirmed topics times the four core content types. */
  totalBlocks: number
  /** Blocks that exist. */
  readyBlocks: number
  /** Generation jobs running now (stale ones left out, as in the planner). */
  activeJobs: number
  failures: GenerationFailureRow[]
}

const BLOCK_NOUN: Record<string, string> = {
  section_notes: 'Notes',
  solved_examples: 'Worked examples',
  interactive_examples: 'Practice',
  topic_quiz: 'The quiz',
}

export const blockNoun = (contentType: string): string => BLOCK_NOUN[contentType] ?? contentTypeLabel(contentType)

export async function getGenerationState(userId: string, course: CourseShell): Promise<GenerationState> {
  const confirmed = course.topics.filter((topic) => topic.confirmed)
  const core = new Set<string>(CORE_CONTENT_TYPES)
  const readyBlocks = confirmed.reduce((sum, topic) => sum + topic.content.filter((type) => core.has(type)).length, 0)

  const staleBefore = new Date(Date.now() - STALE_JOB_WINDOW_MS)
  const pendingBefore = new Date(Date.now() - PENDING_DISPATCH_STALE_MS)

  const [activeJobs, recent] = await Promise.all([
    prisma.processingJob.findMany({
      where: { projectId: course.id, userId, jobType: 'generate_content', status: { in: ACTIVE_JOB_STATUSES } },
      select: { status: true, createdAt: true, startedAt: true },
    }),
    prisma.processingJob.findMany({
      where: { projectId: course.id, userId, jobType: 'generate_content', targetKey: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 600,
      select: { id: true, targetKey: true, status: true, errorCode: true, errorMessage: true },
    }),
  ])

  const active = activeJobs.filter(
    (job) => !(job.createdAt < staleBefore || (job.status === 'pending' && !job.startedAt && job.createdAt < pendingBefore))
  ).length

  const topicsById = new Map(course.topics.map((topic) => [topic.id, topic]))
  const failures = pickGenerationFailures(recent as GenerationJobRow[], (topicId, contentType) =>
    topicsById.get(topicId)?.content.includes(contentType) ?? false
  )
    .filter((failure) => topicsById.has(failure.topicId))
    .map((failure) => {
      const topicName = topicsById.get(failure.topicId)!.name
      return {
        jobId: failure.jobId,
        topicId: failure.topicId,
        topicName,
        contentType: failure.contentType,
        message: `${blockNoun(failure.contentType)} for ${topicName} couldn't be written. ${failure.message}`,
      }
    })

  return { totalBlocks: confirmed.length * CORE_CONTENT_TYPES.length, readyBlocks, activeJobs: active, failures }
}

// ---------------------------------------------------------------------------------------
// Overview

export type RecentExam = {
  submissionId: string
  examId: string
  name: string
  submittedAt: string
  /** 0 to 100, or null while it is still being graded. */
  score: number | null
}

export type TodayTopic = {
  id: string
  name: string
  mastery: number | null
  dueAt: string | null
}

export type TodayData = {
  topicCount: number
  counts: MasteryCounts
  dueCount: number
  /** Course mastery (0..1): mean over all topics, not-started ones counting as 0. Null with no topics. */
  averageMastery: number | null
  tiles: TodayTopic[]
  upNext: DescribedAction[]
  recentExams: RecentExam[]
  generation: GenerationState
}

export type SetupData = {
  /** The step to show as current: 1 add, 2 check, 3 build. */
  step: 1 | 2 | 3
  materials: MaterialsData
  topicCount: number
  confirmedTopicCount: number
  generation: GenerationState
}

export type CourseOverview =
  | { mode: 'today'; course: CourseShell; today: TodayData }
  | { mode: 'setup'; course: CourseShell; setup: SetupData }

const endOfTodayUtc = () => {
  const end = new Date()
  end.setUTCHours(23, 59, 59, 999)
  return end
}

export const isDueToday = (dueAt: string | null): boolean => !!dueAt && new Date(dueAt) <= endOfTodayUtc()

export function summarizeTopics(topics: ShellTopic[]) {
  const confirmed = topics.filter((topic) => topic.confirmed)
  const levels = confirmed.map((topic) => masteryLevel(topic.mastery))
  return {
    topicCount: confirmed.length,
    counts: countMasteryLevels(levels),
    dueCount: confirmed.filter((topic) => isDueToday(topic.dueAt)).length,
    averageMastery: courseMastery(confirmed.map((topic) => topic.mastery)),
  }
}

/** The Today view or the setup guide for a course, with everything either needs. Null if not theirs. */
export async function getCourseOverview(userId: string, courseId: string): Promise<CourseOverview | null> {
  const course = await getCourseShell(userId, courseId)
  if (!course) return null

  if (course.setup.mode === 'setup') {
    const [materials, generation] = await Promise.all([getMaterialsData(userId, courseId), getGenerationState(userId, course)])
    const confirmedTopicCount = course.topics.filter((topic) => topic.confirmed).length
    // The files step stays open while no file is usable yet or one is still being read, unless
    // topic finding has already started.
    const filesDone =
      materials.readyCount > 0 && (materials.processingCount === 0 || !!materials.extractJob || course.topics.length > 0)
    const step = course.setup.step === 2 && !filesDone ? 1 : course.setup.step
    return {
      mode: 'setup',
      course,
      setup: { step, materials, topicCount: course.topics.length, confirmedTopicCount, generation },
    }
  }

  const [actions, generation, submissions] = await Promise.all([
    buildNextActionsForProject(userId, courseId),
    getGenerationState(userId, course),
    prisma.examSubmission.findMany({
      where: { userId, status: 'submitted', sampleExam: { projectId: courseId, project: { userId } } },
      orderBy: { submittedAt: 'desc' },
      take: 3,
      select: {
        id: true,
        submittedAt: true,
        aiGrading: true,
        sampleExam: { select: { id: true, name: true, createdAt: true } },
      },
    }),
  ])

  const names = new Map(course.topics.map((topic) => [topic.id, topic.name]))
  const upNext = actions
    // The "writing your content" row is shown by the building panel instead.
    .map((action) => describeNextAction(action, courseId, action.topicId ? names.get(action.topicId) : null))
    .filter((action) => !action.isGenerating)
    .slice(0, 4)

  const summary = summarizeTopics(course.topics)
  return {
    mode: 'today',
    course,
    today: {
      ...summary,
      tiles: course.topics
        .filter((topic) => topic.confirmed)
        .slice(0, 8)
        .map((topic) => ({ id: topic.id, name: topic.name, mastery: topic.mastery, dueAt: topic.dueAt })),
      upNext,
      generation,
      recentExams: submissions.map((submission) => ({
        submissionId: submission.id,
        examId: submission.sampleExam.id,
        name: examTitle(submission.sampleExam.name, submission.sampleExam.createdAt),
        submittedAt: submission.submittedAt.toISOString(),
        score:
          isRecord(submission.aiGrading) && typeof submission.aiGrading.overall_score === 'number'
            ? submission.aiGrading.overall_score
            : null,
      })),
    },
  }
}

// ---------------------------------------------------------------------------------------
// Topics

export type TopicRow = {
  id: string
  name: string
  description: string | null
  keywords: string[]
  orderIndex: number
  confirmed: boolean
  mastery: number | null
  dueAt: string | null
  lastReviewedAt: string | null
  progress: { notes: boolean; examples: boolean; quiz: boolean; quizScore: number | null }
  content: string[]
}

export type TopicsData = {
  courseName: string
  topics: TopicRow[]
  /** At least one topic is not confirmed yet. */
  hasUnconfirmed: boolean
  materialsReady: number
  materialsProcessing: number
  extractJob: JobRef | null
  extractFailure: string | null
  /** Missing core blocks across confirmed topics. */
  missingBlocks: number
  generation: GenerationState
}

export async function getTopicsData(userId: string, courseId: string): Promise<TopicsData | null> {
  const course = await getCourseShell(userId, courseId)
  if (!course) return null

  const [extra, materials, generation] = await Promise.all([
    prisma.topic.findMany({
      where: { projectId: courseId, project: { userId } },
      select: {
        id: true,
        keywords: true,
        reviewSchedules: { where: { userId }, take: 1, select: { lastReviewedAt: true } },
      },
    }),
    getMaterialsData(userId, courseId),
    getGenerationState(userId, course),
  ])
  const extraById = new Map(extra.map((row) => [row.id, row]))

  const topics: TopicRow[] = course.topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    description: topic.description,
    keywords: extraById.get(topic.id)?.keywords ?? [],
    orderIndex: topic.orderIndex,
    confirmed: topic.confirmed,
    mastery: topic.mastery,
    dueAt: topic.dueAt,
    lastReviewedAt: extraById.get(topic.id)?.reviewSchedules[0]?.lastReviewedAt?.toISOString() ?? null,
    progress: topic.progress,
    content: topic.content,
  }))

  return {
    courseName: course.name,
    topics,
    hasUnconfirmed: topics.some((topic) => !topic.confirmed),
    materialsReady: materials.readyCount,
    materialsProcessing: materials.processingCount,
    extractJob: materials.extractJob,
    extractFailure: materials.extractFailure,
    missingBlocks: generation.totalBlocks - generation.readyBlocks,
    generation,
  }
}
