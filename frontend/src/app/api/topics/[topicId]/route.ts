/**
 * API routes for individual topics
 * PATCH /api/topics/[topicId] - Update topic (name, description, confirmed, or move it to
 *   a new position with orderIndex; the topics around it shift to make room)
 * DELETE /api/topics/[topicId] - Delete topic
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { z } from 'zod'
import { moveInOrder } from '@/lib/topics/ordering'

const updateTopicSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().optional(),
  userConfirmed: z.boolean().optional(),
  orderIndex: z.number().int().min(0).optional(),
})

export async function PATCH(
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

    const { orderIndex, ...fields } = validation.data

    const updatedTopic = await prisma.$transaction(async (tx) => {
      if (orderIndex !== undefined) {
        const siblings = await tx.topic.findMany({
          where: { projectId: topic.projectId },
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, orderIndex: true },
        })
        const newOrder = moveInOrder(
          siblings.map((sibling) => sibling.id),
          topicId,
          orderIndex
        )
        const currentIndex = new Map(siblings.map((sibling) => [sibling.id, sibling.orderIndex]))
        for (const [index, id] of newOrder.entries()) {
          if (currentIndex.get(id) !== index) {
            await tx.topic.update({ where: { id }, data: { orderIndex: index } })
          }
        }
      }
      return tx.topic.update({ where: { id: topicId }, data: fields })
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
