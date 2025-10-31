/**
 * API routes for individual topics
 * PATCH /api/topics/[topicId] - Update topic
 * DELETE /api/topics/[topicId] - Delete topic
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { z } from 'zod'

const updateTopicSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  userConfirmed: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { topicId: string } }
) {
  try {
    const session = await requireAuth()
    const { topicId } = params

    // Verify topic ownership through project
    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        project: {
          userId: session.user.id,
        },
      },
    })

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validation = updateTopicSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error },
        { status: 400 }
      )
    }

    // Update topic
    const updatedTopic = await prisma.topic.update({
      where: { id: topicId },
      data: validation.data,
    })

    return NextResponse.json({ topic: updatedTopic })
  } catch (error) {
    console.error('Update topic error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update topic' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { topicId: string } }
) {
  try {
    const session = await requireAuth()
    const { topicId } = params

    // Verify topic ownership through project
    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        project: {
          userId: session.user.id,
        },
      },
    })

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      )
    }

    // Delete topic (cascade will handle related records)
    await prisma.topic.delete({
      where: { id: topicId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete topic error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete topic' },
      { status: 500 }
    )
  }
}
