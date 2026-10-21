/**
 * "Fresh review": a new 6-question quiz set for a topic that is due, written by the regeneration
 * path (cached excerpts). Difficulty follows the topic's mastery, the focus is the concepts of the
 * questions missed lately, and 1-2 questions come from the weakest prerequisite topic when there is one.
 * POST /api/topics/[topicId]/fresh-review -> the same answer as regenerate-content (a job id to follow).
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { startRegeneration } from '@/lib/jobs/regenerate'
import { freshReviewPreferences, planFreshReview } from '@/lib/learning/review-server'
import { apiInternal, apiNotFound, apiUnauthorized, isUnauthorizedError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  try {
    const session = await requireAuth()
    const { topicId } = await params
    const topic = await prisma.topic.findFirst({
      where: { id: topicId, project: { userId: session.user.id } },
      select: { id: true, projectId: true },
    })
    if (!topic) return apiNotFound('Topic not found')

    const plan = await planFreshReview(session.user.id, topic)
    return await startRegeneration({
      userId: session.user.id,
      topic,
      contentType: 'topic_quiz',
      preferences: freshReviewPreferences(plan),
    })
  } catch (error) {
    console.error('Fresh review error:', error)
    if (isUnauthorizedError(error)) return apiUnauthorized()
    return apiInternal('Failed to start the fresh review')
  }
}
