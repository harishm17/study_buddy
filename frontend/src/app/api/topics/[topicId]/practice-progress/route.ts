/**
 * Practice progress, stored on the server so it follows the student across devices.
 * GET  /api/topics/[topicId]/practice-progress  - the progress on the topic's current practice problems
 * POST /api/topics/[topicId]/practice-progress  - store one problem's solved, shown and hinted steps
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { loadPracticeProgress, savePracticeProgress } from '@/lib/learning/practice-server'
import {
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
  zodDetails,
} from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

const steps = z.array(z.number().int().min(0).max(200)).max(200)

const saveSchema = z.object({
  problemIndex: z.number().int().min(0).max(200),
  // The problem's title when the student worked on it: a practice that was rewritten starts clean.
  problemTitle: z.string().max(500),
  solvedSteps: steps,
  revealedSteps: steps,
  hintedSteps: steps,
  // Progress that was kept in the browser before the server stored it, uploaded once.
  migrated: z.boolean().optional(),
})

async function ownedTopic(userId: string, topicId: string) {
  return prisma.topic.findFirst({
    where: { id: topicId, project: { userId } },
    select: { id: true, projectId: true },
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  try {
    const session = await requireAuth()
    const { topicId } = await params
    if (!(await ownedTopic(session.user.id, topicId))) return apiNotFound('Topic not found')
    return NextResponse.json({ problems: await loadPracticeProgress(session.user.id, topicId) })
  } catch (error) {
    console.error('Practice progress read error:', error)
    if (isUnauthorizedError(error)) return apiUnauthorized()
    return apiInternal('Failed to load practice progress')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  try {
    const session = await requireAuth()
    const { topicId } = await params
    const topic = await ownedTopic(session.user.id, topicId)
    if (!topic) return apiNotFound('Topic not found')

    const body = await request.json().catch(() => null)
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) return apiInvalidInput('Invalid input', zodDetails(parsed.error))

    const result = await savePracticeProgress(session.user.id, topic, parsed.data)
    if (result.status === 'stale') {
      // The practice was rewritten or removed since the student started: the browser reloads it.
      return NextResponse.json({ error: 'That problem is no longer in this practice.', code: 'STALE_PRACTICE' }, { status: 409 })
    }
    return NextResponse.json({ completed: result.completed, completedNow: result.completedNow, score: result.score })
  } catch (error) {
    console.error('Practice progress save error:', error)
    if (isUnauthorizedError(error)) return apiUnauthorized()
    return apiInternal('Failed to save practice progress')
  }
}
