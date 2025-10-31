/**
 * API routes for topics
 * GET /api/projects/[projectId]/topics - List topics
 * POST /api/projects/[projectId]/topics - Create topic (manual)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { z } from 'zod'

const createTopicSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireAuth()
    const { projectId } = await params

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Fetch topics
    const topics = await prisma.topic.findMany({
      where: { projectId },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        keywords: true,
        orderIndex: true,
        userConfirmed: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ topics })
  } catch (error) {
    console.error('Fetch topics error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch topics' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireAuth()
    const { projectId } = await params

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validation = createTopicSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error },
        { status: 400 }
      )
    }

    // Get next order index
    const maxOrder = await prisma.topic.findFirst({
      where: { projectId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    })

    const nextOrder = (maxOrder?.orderIndex ?? -1) + 1

    // Create topic
    const topic = await prisma.topic.create({
      data: {
        projectId,
        name: validation.data.name,
        description: validation.data.description || '',
        keywords: [],
        orderIndex: nextOrder,
        sourceMaterialIds: [],
        userConfirmed: true, // Manually created topics are auto-confirmed
      },
    })

    return NextResponse.json({ topic })
  } catch (error) {
    console.error('Create topic error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create topic' },
      { status: 500 }
    )
  }
}
