/**
 * POST /api/voice/turn: one exchange with the voice coach.
 *
 * Body: { sessionId, utterance }. The browser does speech-to-text and text-to-speech; this
 * route runs the text conversation with Claude (through the AI service), runs the drill tools
 * on the server, keeps the conversation on the session, and answers with newline-delimited
 * JSON events (see src/lib/voice/turn-client.ts). Problems found before the reply starts are
 * ordinary JSON errors.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import {
  ApiErrorCode,
  apiError,
  apiInternal,
  apiInvalidInput,
  apiNotFound,
  apiUnauthorized,
  isUnauthorizedError,
  zodDetails,
} from '@/lib/api/errors'
import { createRateLimiter } from '@/lib/api/rate-limit'
import {
  VoiceModelError,
  modelErrorFromResponse,
  readModelEvents,
  requestModelTurn,
} from '@/lib/voice/ai-turn'
import { claimVoiceSession, isSerializationConflict } from '@/lib/voice/claim'
import {
  COACH_STYLES,
  CONTINUE_MESSAGE,
  buildCoachSystemPrompt,
  startMessage,
  styleUsesTools,
  type CoachStyle,
} from '@/lib/voice/coach-prompt'
import { extractTextFromNotes } from '@/lib/voice/concept'
import { voiceErrorMessage } from '@/lib/voice/errors'
import { appendUserText, parseHistory, toStoredHistory, type VoiceMessage } from '@/lib/voice/history'
import { VOICE_TOOLS, executeVoiceTool } from '@/lib/voice/tools'
import { runTurn } from '@/lib/voice/turn-engine'
import type { VoiceEvent } from '@/lib/voice/turn-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UTTERANCE_CHARS = 2000

// Every turn is at least one model call.
const turnLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 })

// Sessions with a turn running on this instance. Two turns at once would each load the same
// history and the later write would drop the earlier one.
const turnsInProgress = new Set<string>()

const bodySchema = z.object({
  sessionId: z.string().min(1),
  // Empty (or missing) means "start the session" the first time, "carry on" afterwards.
  utterance: z.string().trim().max(MAX_UTTERANCE_CHARS, `Keep it under ${MAX_UTTERANCE_CHARS} characters`).default(''),
})

/** A JSON error in the B shape, with the friendly message for `code` and the code in details. */
function voiceFailure(code: string, extraDetails: Record<string, unknown> = {}, retryable?: boolean) {
  const info = voiceErrorMessage(code)
  const apiCode =
    code === 'LLM_DAILY_BUDGET' || code === 'RATE_LIMITED' || code === 'VOICE_DAILY_LIMIT'
      ? ApiErrorCode.RATE_LIMITED
      : code === 'SESSION_ENDED' || code === 'ACTIVE_SESSION' || code === 'TURN_IN_PROGRESS'
        ? ApiErrorCode.CONFLICT
        : code === 'PROJECT_NOT_FOUND'
          ? ApiErrorCode.NOT_FOUND
          : ApiErrorCode.UPSTREAM_ERROR
  return apiError(apiCode, info.message, { code, retryable: retryable ?? info.retryable, ...extraDetails }, info.status)
}

/** What the coach needs to know about the session's topic or sprint, read fresh each turn. */
async function loadPromptContext(session: { mode: string; topicId: string | null; questionSet: Prisma.JsonValue }) {
  if (session.mode === 'sprint') {
    const ids = new Set<string>()
    if (Array.isArray(session.questionSet)) {
      for (const question of session.questionSet as Array<{ topic_id?: unknown }>) {
        if (typeof question?.topic_id === 'string' && question.topic_id) ids.add(question.topic_id)
      }
    }
    const topics = ids.size
      ? await prisma.topic.findMany({
          where: { id: { in: [...ids] } },
          select: { name: true },
          orderBy: { orderIndex: 'asc' },
        })
      : []
    return { topicName: null, topicDescription: null, notes: null, sprintTopics: topics.map((topic) => topic.name) }
  }
  const topic = session.topicId
    ? await prisma.topic.findUnique({
        where: { id: session.topicId },
        select: {
          name: true,
          description: true,
          content: { where: { contentType: 'section_notes' }, select: { contentData: true }, take: 1 },
        },
      })
    : null
  return {
    topicName: topic?.name ?? null,
    topicDescription: topic?.description ?? null,
    notes: topic?.content[0] ? extractTextFromNotes(topic.content[0].contentData) : null,
    sprintTopics: [] as string[],
  }
}

export async function POST(request: NextRequest) {
  let userId: string
  try {
    userId = (await requireAuth()).user.id
  } catch (error) {
    if (isUnauthorizedError(error)) return apiUnauthorized()
    console.error('[VOICE] Auth failed:', error)
    return apiInternal('Failed to start the turn')
  }

  const limit = turnLimiter.check(userId)
  if (!limit.ok) {
    const response = voiceFailure('RATE_LIMITED')
    response.headers.set('Retry-After', String(limit.retryAfterSeconds))
    return response
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiInvalidInput('The request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiInvalidInput(parsed.error.issues[0]?.message ?? 'Invalid input', zodDetails(parsed.error))
  }
  const { sessionId, utterance } = parsed.data

  const session = await prisma.voiceDrillSession.findFirst({ where: { id: sessionId, userId } })
  if (!session) return apiNotFound('Session not found')
  if (session.status !== 'active' || session.endedAt) return voiceFailure('SESSION_ENDED')

  if (turnsInProgress.has(session.id)) return voiceFailure('TURN_IN_PROGRESS')
  turnsInProgress.add(session.id)
  let claimedHere = false
  const releaseTurn = () => turnsInProgress.delete(session.id)
  // A failed first turn must not leave the session counted as connected.
  const releaseClaim = async () => {
    if (!claimedHere) return
    claimedHere = false
    await prisma.voiceDrillSession
      .update({ where: { id: session.id }, data: { connectedAt: null, lastSeenAt: null } })
      .catch((error) => console.error('[VOICE] Could not release the session claim:', error))
  }

  try {
    // First turn: one live session per user and the daily cap. Later turns: stay live.
    if (!session.connectedAt) {
      const claim = await claimVoiceSession(session)
      if (!claim.ok) {
        releaseTurn()
        return claim.reason === 'busy'
          ? voiceFailure('ACTIVE_SESSION')
          : voiceFailure('VOICE_DAILY_LIMIT', { remainingSeconds: 0, dailyMinutes: claim.capMinutes })
      }
      claimedHere = true
    } else {
      await prisma.voiceDrillSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
    }

    const style: CoachStyle = (COACH_STYLES as readonly string[]).includes(session.style)
      ? (session.style as CoachStyle)
      : 'oral_quiz'
    const context = await loadPromptContext(session)
    const system = buildCoachSystemPrompt({
      mode: session.mode === 'sprint' ? 'sprint' : 'topic_drill',
      style,
      language: session.language,
      focus: session.focus,
      ...context,
    })
    const tools = styleUsesTools(style) ? VOICE_TOOLS : []

    const history = parseHistory(session.history)
    const userText = utterance || (history.length === 0 ? startMessage(style, context.topicName) : CONTINUE_MESSAGE)
    const startMessages: VoiceMessage[] = appendUserText(history, userText)

    const modelRequest = (messages: VoiceMessage[]) =>
      requestModelTurn({ userId, projectId: session.projectId, sessionId: session.id, system, messages, tools })

    // Ask first. When the AI service refuses (daily budget) or is down, the session keeps its
    // old conversation and the browser gets an ordinary JSON error.
    let first: Response
    try {
      first = await modelRequest(startMessages)
    } catch (error) {
      console.error('[VOICE] The AI service is not reachable:', error)
      await releaseClaim()
      releaseTurn()
      return voiceFailure('VOICE_UNAVAILABLE')
    }
    if (!first.ok || !first.body) {
      const failure = await modelErrorFromResponse(first)
      console.error(`[VOICE] ${failure.message}`)
      await releaseClaim()
      releaseTurn()
      return voiceFailure(failure.code, {}, failure.retryable)
    }
    const firstBody = first.body

    const encoder = new TextEncoder()
    let clientGone = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: VoiceEvent) => {
          if (clientGone) return
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
          } catch {
            clientGone = true
          }
        }
        const sendError = (code: string) => {
          const info = voiceErrorMessage(code)
          send({ type: 'error', code, message: info.message, retryable: info.retryable })
        }

        void (async () => {
          try {
            const outcome = await runTurn(
              {
                async openModel(messages, callNumber) {
                  if (callNumber === 1) return readModelEvents(firstBody)
                  let response: Response
                  try {
                    response = await modelRequest(messages)
                  } catch (error) {
                    console.error('[VOICE] The AI service is not reachable:', error)
                    throw new VoiceModelError('VOICE_UNAVAILABLE', 'The AI service is not reachable', true)
                  }
                  if (!response.ok || !response.body) throw await modelErrorFromResponse(response)
                  return readModelEvents(response.body)
                },
                runTool: (name, input) => executeVoiceTool({ sessionId: session.id, userId }, name, input),
                emit: send,
              },
              startMessages
            )

            // Keep the conversation when the turn worked, or when it failed after tools had
            // already recorded something (a retry must not record it twice).
            let saved = true
            if (outcome.ok || outcome.toolsRan) {
              try {
                await prisma.voiceDrillSession.update({
                  where: { id: session.id },
                  data: {
                    history: toStoredHistory(outcome.messages) as unknown as Prisma.InputJsonValue,
                    lastSeenAt: new Date(),
                  },
                })
              } catch (error) {
                console.error('[VOICE] Could not store the conversation:', error)
                saved = false
              }
            } else if (!outcome.text) {
              await releaseClaim()
            }

            if (outcome.ok) {
              if (saved) send({ type: 'done', text: outcome.text })
              else sendError('VOICE_NOT_SAVED')
            }
            // A failed turn has already sent its error event.
          } catch (error) {
            console.error('[VOICE] The turn crashed:', error)
            sendError('VOICE_TURN_FAILED')
          } finally {
            releaseTurn()
            try {
              controller.close()
            } catch {
              // Already closed because the browser went away.
            }
          }
        })()
      },
      cancel() {
        // The browser left. The turn keeps going so the conversation is still stored.
        clientGone = true
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    releaseTurn()
    await releaseClaim()
    if (isSerializationConflict(error)) return voiceFailure('TURN_IN_PROGRESS')
    console.error('[VOICE] Turn failed:', error)
    return apiInternal('Failed to run the turn')
  }
}
