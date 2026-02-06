/**
 * API route for topic content
 * GET /api/topics/[topicId]/content?type=section_notes
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import type { Prisma } from '@prisma/client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    const session = await requireAuth()
    const { topicId } = await params
    const { searchParams } = new URL(request.url)
    const contentType = searchParams.get('type')

    // Verify topic ownership
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

    // Build where clause
    const where: Prisma.TopicContentWhereInput = { topicId }
    if (contentType) {
      where.contentType = contentType
    }

    // Fetch content
    const content = await prisma.topicContent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        contentType: true,
        contentData: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // If specific type requested, return single object
    if (contentType) {
      return NextResponse.json({
        content: content[0] || null,
      })
    }

    // Otherwise return all content types
    return NextResponse.json({ content })
  } catch (error) {
    console.error('Fetch content error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch content' },
      { status: 500 }
    )
  }
}
