/**
 * API route for regenerating content (creates fresh variations)
 * POST /api/topics/[topicId]/regenerate-content
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import {
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
  zodDetails,
} from '@/lib/api/errors'
import { regenerateContentSchema, startRegeneration } from '@/lib/jobs/regenerate'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    const session = await requireAuth()
    const { topicId } = await params

    // Verify topic ownership through project
    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        project: {
          userId: session.user.id,
        },
      },
      select: { id: true, projectId: true },
    })

    if (!topic) {
      return apiNotFound('Topic not found')
    }

    const body = await request.json()
    const validation = regenerateContentSchema.safeParse(body)

    if (!validation.success) {
      return apiInvalidInput('Invalid input', zodDetails(validation.error))
    }

    const { contentType, preferences } = validation.data
    return await startRegeneration({ userId: session.user.id, topic, contentType, preferences })
  } catch (error) {
    console.error('Content regeneration error:', error)

    if (isUnauthorizedError(error)) {
      return apiUnauthorized()
    }

    return apiInternal('Failed to start content regeneration')
  }
}
