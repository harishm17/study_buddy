/**
 * POST /api/projects/[projectId]/topics/merge
 * Merge one topic (the source) into another (the target). The source is deleted.
 *
 * What moves to the target:
 *  - chunk mappings (a chunk both topics map to keeps the higher relevance score)
 *  - generated content of a type the target does not have, and all quiz sets
 *  - quiz attempts, learning signals and voice sessions and attempts
 *  - progress (checkmarks are OR-ed, the best quiz score is kept) and the review schedule
 *    (the target's own is kept when both have one)
 * The target keeps its own generated content, since it may now be out of date against the
 * merged chunks; regenerate it from the topic page if needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { mergeKeywordLists } from '@/lib/topics/ordering'
import {
  ApiErrorCode,
  apiError,
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
  zodDetails,
} from '@/lib/api/errors'

const mergeSchema = z.object({
  sourceTopicId: z.string().min(1),
  targetTopicId: z.string().min(1),
  name: z.string().trim().min(1).max(255).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireAuth()
    const { projectId } = await params

    const parsed = mergeSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return apiInvalidInput('Invalid input', zodDetails(parsed.error))
    }
    const { sourceTopicId, targetTopicId, name } = parsed.data
    if (sourceTopicId === targetTopicId) {
      return apiInvalidInput('Choose two different topics to merge')
    }

    // Ownership: both topics must belong to this project, and the project to this user.
    const topics = await prisma.topic.findMany({
      where: {
        id: { in: [sourceTopicId, targetTopicId] },
        projectId,
        project: { userId: session.user.id },
      },
    })
    const source = topics.find((topic) => topic.id === sourceTopicId)
    const target = topics.find((topic) => topic.id === targetTopicId)
    if (!source || !target) {
      return apiNotFound('Topic not found')
    }

    const merged = await prisma.$transaction(async (tx) => {
      // Chunk mappings.
      const [sourceMappings, targetMappings] = await Promise.all([
        tx.topicChunkMapping.findMany({ where: { topicId: source.id } }),
        tx.topicChunkMapping.findMany({ where: { topicId: target.id } }),
      ])
      const targetByChunk = new Map(targetMappings.map((mapping) => [mapping.chunkId, mapping]))
      for (const mapping of sourceMappings) {
        const existing = targetByChunk.get(mapping.chunkId)
        if (!existing) {
          await tx.topicChunkMapping.update({
            where: { id: mapping.id },
            data: { topicId: target.id },
          })
        } else if (mapping.relevanceScore > existing.relevanceScore) {
          await tx.topicChunkMapping.update({
            where: { id: existing.id },
            data: {
              relevanceScore: mapping.relevanceScore,
              relevanceSource: mapping.relevanceSource,
            },
          })
        }
      }

      // Generated content and quiz sets.
      const targetContent = await tx.topicContent.findMany({
        where: { topicId: target.id },
        select: { contentType: true },
      })
      await tx.topicContent.updateMany({
        where: {
          topicId: source.id,
          contentType: { notIn: targetContent.map((item) => item.contentType) },
        },
        data: { topicId: target.id },
      })
      await tx.topicQuiz.updateMany({ where: { topicId: source.id }, data: { topicId: target.id } })

      // Learning history.
      await tx.quizAttempt.updateMany({ where: { topicId: source.id }, data: { topicId: target.id } })
      await tx.learningSignal.updateMany({ where: { topicId: source.id }, data: { topicId: target.id } })
      await tx.voiceDrillSession.updateMany({ where: { topicId: source.id }, data: { topicId: target.id } })
      await tx.voiceDrillAttempt.updateMany({ where: { topicId: source.id }, data: { topicId: target.id } })

      // Progress: one row per user and topic.
      const sourceProgress = await tx.topicProgress.findMany({ where: { topicId: source.id } })
      for (const row of sourceProgress) {
        const existing = await tx.topicProgress.findUnique({
          where: { topicId_userId: { topicId: target.id, userId: row.userId } },
        })
        if (!existing) {
          await tx.topicProgress.update({ where: { id: row.id }, data: { topicId: target.id } })
        } else {
          const scores = [existing.quizScore, row.quizScore].filter(
            (score): score is number => typeof score === 'number'
          )
          await tx.topicProgress.update({
            where: { id: existing.id },
            data: {
              notesCompleted: existing.notesCompleted || row.notesCompleted,
              examplesCompleted: existing.examplesCompleted || row.examplesCompleted,
              quizCompleted: existing.quizCompleted || row.quizCompleted,
              quizScore: scores.length > 0 ? Math.max(...scores) : null,
            },
          })
        }
      }

      // Review schedule: one row per user and topic. The target's wins.
      const sourceSchedules = await tx.reviewSchedule.findMany({ where: { topicId: source.id } })
      for (const row of sourceSchedules) {
        const existing = await tx.reviewSchedule.findUnique({
          where: { userId_topicId: { userId: row.userId, topicId: target.id } },
        })
        if (!existing) {
          await tx.reviewSchedule.update({ where: { id: row.id }, data: { topicId: target.id } })
        }
      }

      await tx.topic.update({
        where: { id: target.id },
        data: {
          name: name ?? target.name,
          description: target.description?.trim() ? target.description : source.description,
          keywords: mergeKeywordLists(target.keywords, source.keywords),
          sourceMaterialIds: Array.from(new Set([...target.sourceMaterialIds, ...source.sourceMaterialIds])),
          userConfirmed: target.userConfirmed && source.userConfirmed,
        },
      })

      // What is left on the source (its own progress and schedule rows that lost to the
      // target's) goes with it.
      await tx.topic.delete({ where: { id: source.id } })

      // Close the gap in the order.
      const remaining = await tx.topic.findMany({
        where: { projectId },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, orderIndex: true },
      })
      for (const [index, topic] of remaining.entries()) {
        if (topic.orderIndex !== index) {
          await tx.topic.update({ where: { id: topic.id }, data: { orderIndex: index } })
        }
      }

      return tx.topic.findUniqueOrThrow({ where: { id: target.id } })
    })

    return NextResponse.json({ topic: merged, mergedTopicId: source.id })
  } catch (error) {
    console.error('Merge topics error:', error)
    if (isUnauthorizedError(error)) return apiUnauthorized()
    if (error instanceof SyntaxError) {
      return apiError(ApiErrorCode.INVALID_INPUT, 'Invalid JSON body', undefined, 400)
    }
    return apiInternal('Failed to merge topics')
  }
}
