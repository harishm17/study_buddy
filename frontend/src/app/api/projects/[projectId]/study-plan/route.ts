import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { buildStudyPlanForProject } from '@/lib/learning/planner'
import {
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
} from '@/lib/api/errors'

const querySchema = z.object({
  date: z.string().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth()
    const { projectId } = await params
    const parsed = querySchema.safeParse({
      date: new URL(request.url).searchParams.get('date') || undefined,
    })
    if (!parsed.success) {
      return apiInvalidInput('Invalid query parameters')
    }

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

    const planDate = parsed.data.date ? new Date(parsed.data.date) : new Date()
    if (Number.isNaN(planDate.getTime())) {
      return apiInvalidInput('Invalid date format. Use YYYY-MM-DD')
    }

    const plan = await buildStudyPlanForProject(auth.user.id, projectId, planDate)
    return NextResponse.json({
      date: planDate.toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      plan,
    })
  } catch (error) {
    console.error('Study plan error:', error)
    if (isUnauthorizedError(error)) return apiUnauthorized()
    return apiInternal('Failed to load study plan')
  }
}
