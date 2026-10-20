import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { aiServiceHeaders } from '@/lib/ai-service/headers'
import { dailyVoiceMinutes, isSessionLive, remainingSeconds } from '@/lib/voice/usage'

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

export async function POST(request: NextRequest) {
  let releaseClaim: () => Promise<unknown> = async () => undefined
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

    if (voiceSession.status !== 'active' || voiceSession.endedAt) {
      return NextResponse.json(
        { error: 'This voice session has ended. Start a new session.' },
        { status: 409 }
      )
    }

    // Check the daily cap and the one-session rule, and claim the session, in one
    // serializable transaction so two requests cannot both pass.
    const now = new Date()
    const capMinutes = dailyVoiceMinutes()
    const claim = await prisma.$transaction(
      async (tx) => {
        const recent = await tx.voiceDrillSession.findMany({
          where: {
            userId: auth.user.id,
            connectedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
          select: { id: true, connectedAt: true, lastSeenAt: true, endedAt: true },
        })
        if (recent.some((other) => other.id !== voiceSession.id && isSessionLive(other, now))) {
          return { ok: false as const, reason: 'busy' as const }
        }
        const remaining = remainingSeconds(recent, capMinutes, now)
        if (remaining <= 0) {
          return { ok: false as const, reason: 'cap' as const }
        }
        await tx.voiceDrillSession.update({
          where: { id: voiceSession.id },
          data: {
            connectedAt: voiceSession.connectedAt ?? now,
            lastSeenAt: now,
          },
        })
        return { ok: true as const, remaining }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )

    if (!claim.ok && claim.reason === 'busy') {
      return NextResponse.json(
        { error: 'Another voice session is already open. End it before starting a new one.' },
        { status: 409 }
      )
    }
    if (!claim.ok) {
      return NextResponse.json(
        {
          error: `You have used your ${capMinutes} voice minutes for the last 24 hours. Try again later.`,
          remainingSeconds: 0,
        },
        { status: 429 }
      )
    }

    // A failed mint must not leave the session counted as connected.
    releaseClaim = () =>
      prisma.voiceDrillSession
        .update({
          where: { id: voiceSession.id },
          data: { connectedAt: voiceSession.connectedAt, lastSeenAt: voiceSession.lastSeenAt },
        })
        .catch((error) => console.error('Could not release voice session claim:', error))

    const response = await fetch(`${AI_SERVICE_URL}/voice/realtime/token`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: aiServiceHeaders(),
      body: JSON.stringify({
        session_id: voiceSession.id,
        language: voiceSession.language,
        voice: voiceSession.voice,
        expires_after: 120,
      }),
    })

    if (response.status === 503) {
      await releaseClaim()
      // The AI service has no OpenAI key, so the realtime voice coach is turned off.
      return NextResponse.json(
        { error: 'Voice coaching is not available on this server.' },
        { status: 503 }
      )
    }

    if (!response.ok) {
      await releaseClaim()
      return NextResponse.json(
        { error: 'Failed to mint realtime token', detail: await response.text() },
        { status: response.status }
      )
    }

    const rawData = await response.json()
    const parsed = aiRealtimeTokenSchema.safeParse(rawData)
    if (!parsed.success) {
      await releaseClaim()
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
      dailyMinutes: capMinutes,
      remainingSeconds: claim.remaining,
    })
  } catch (error) {
    console.error('Realtime token error:', error)
    await releaseClaim()

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      // Two requests raced; the other one won.
      return NextResponse.json({ error: 'Another voice request is in progress. Try again.' }, { status: 409 })
    }

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Failed to create realtime token' }, { status: 500 })
  }
}
