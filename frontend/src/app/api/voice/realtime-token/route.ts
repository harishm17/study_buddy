import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const tokenSchema = z.object({
  sessionId: z.string(),
})

const aiRealtimeTokenSchema = z.object({
  client_secret: z.object({
    value: z.string(),
    expires_at: z.number().optional(),
  }),
  expires_at: z.number().optional(),
  session: z.record(z.any()).optional(),
})

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'
const AI_INTERNAL_TOKEN = process.env.AI_INTERNAL_TOKEN

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    const body = await request.json()
    const payload = tokenSchema.parse(body)

    const voiceSession = await prisma.voiceDrillSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: auth.user.id,
      },
    })

    if (!voiceSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const response = await fetch(`${AI_SERVICE_URL}/voice/realtime/token`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        ...(AI_INTERNAL_TOKEN ? { 'x-ai-internal-token': AI_INTERNAL_TOKEN } : {}),
      },
      body: JSON.stringify({
        session_id: voiceSession.id,
        language: voiceSession.language,
        voice: voiceSession.voice,
        expires_after: 120,
      }),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to mint realtime token', detail: await response.text() },
        { status: response.status }
      )
    }

    const rawData = await response.json()
    const parsed = aiRealtimeTokenSchema.safeParse(rawData)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid realtime token response from AI service' },
        { status: 502 }
      )
    }
    const data = parsed.data

    return NextResponse.json({
      clientSecret: data.client_secret,
      expiresAt: data.expires_at,
      session: data.session,
    })
  } catch (error) {
    console.error('Realtime token error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Failed to create realtime token' }, { status: 500 })
  }
}
