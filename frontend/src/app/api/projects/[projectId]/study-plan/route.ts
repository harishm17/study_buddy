import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { buildStudyPlanForProject } from '@/lib/learning/planner'
import { isValidTimeZone, localDateParts, planStartTime } from '@/lib/learning/study-plan-time'
import {
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
} from '@/lib/api/errors'

// date is a YYYY-MM-DD calendar date and tz an IANA time zone name such as America/Chicago,
// both in the student's own zone. Without tz the plan is laid out in UTC.
const querySchema = z.object({
  date: z.string().optional(),
  tz: z.string().max(64).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth()
    const { projectId } = await params
    const searchParams = new URL(request.url).searchParams
    const parsed = querySchema.safeParse({
      date: searchParams.get('date') || undefined,
      tz: searchParams.get('tz') || undefined,
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

    const timeZone = parsed.data.tz ?? 'UTC'
    if (!isValidTimeZone(timeZone)) {
      return apiInvalidInput('Invalid time zone. Use an IANA name such as America/Chicago')
    }

    const startAt = planStartTime({ date: parsed.data.date, timeZone })
    if (!startAt) {
      return apiInvalidInput('Invalid date format. Use YYYY-MM-DD')
    }

    const plan = await buildStudyPlanForProject(auth.user.id, projectId, startAt)
    const day = localDateParts(startAt, timeZone)
    return NextResponse.json({
      date: `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`,
      timeZone,
      generatedAt: new Date().toISOString(),
      plan,
    })
  } catch (error) {
    console.error('Study plan error:', error)
    if (isUnauthorizedError(error)) return apiUnauthorized()
    return apiInternal('Failed to load study plan')
  }
}
