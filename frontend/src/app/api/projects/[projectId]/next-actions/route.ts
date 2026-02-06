import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { buildNextActionsForProject } from '@/lib/learning/planner'
import {
  apiInternal,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
} from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth()
    const { projectId } = await params

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: auth.user.id,
      },
      select: { id: true },
    })

    if (!project) {
      return apiNotFound('Project not found')
    }

    const actions = await buildNextActionsForProject(auth.user.id, projectId)
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      actions,
    })
  } catch (error) {
    console.error('Next actions error:', error)
    if (isUnauthorizedError(error)) return apiUnauthorized()
    return apiInternal('Failed to load next actions')
  }
}
