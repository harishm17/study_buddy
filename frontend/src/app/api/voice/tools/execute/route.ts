import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { VoiceQuestion } from '@/lib/voice/concept'
import {
  computeTopicMastery,
  recordLearningSignal,
  upsertReviewSchedule,
} from '@/lib/learning/mastery'

const toolSchema = z.object({
  call_id: z.string(),
  name: z.string(),
  arguments: z.union([z.string(), z.record(z.any())]),
})

const getNextQuestionArgsSchema = z.object({
  session_id: z.string(),
}).strict()

const recordAnswerArgsSchema = z.object({
  session_id: z.string(),
  question_index: z.number().int().nonnegative(),
  user_answer: z.string().min(1),
}).strict()

const getHintArgsSchema = z.object({
  session_id: z.string(),
  question_index: z.number().int().nonnegative(),
}).strict()

const getTopicIdFromQuestion = (question: VoiceQuestion): string | null => {
  if (typeof question.topic_id === 'string' && question.topic_id.length > 0) {
    return question.topic_id
  }
  return null
}

const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')

const toTokenSet = (value: string) =>
  new Set(
    normalizeText(value)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
  )

const hasConceptMatch = (answer: string, keyPoint: string) => {
  const normalizedAnswer = normalizeText(answer)
  const normalizedPoint = normalizeText(keyPoint)
  if (!normalizedPoint) return false
  if (normalizedAnswer.includes(normalizedPoint)) return true

  const pointTokens = [...toTokenSet(keyPoint)]
  if (pointTokens.length === 0) return false
  const answerTokens = toTokenSet(answer)
  const overlap = pointTokens.filter((token) => answerTokens.has(token)).length

  // Accept paraphrases when most concept tokens are present.
  return overlap / pointTokens.length >= 0.6
}

const scoreKeyPoints = (answer: string, keyPoints: string[]) => {
  if (keyPoints.length === 0) {
    return { score: 0, matched: [], missing: [] }
  }

  const matched = keyPoints.filter(point =>
    hasConceptMatch(answer, point)
  )
  const missing = keyPoints.filter(point => !matched.includes(point))
  const score = matched.length / keyPoints.length
  return { score, matched, missing }
}

const scoreSampleAnswer = (answer: string, sample: string) => {
  const answerTokens = new Set(normalizeText(answer).split(/\s+/).filter(Boolean))
  const sampleTokens = normalizeText(sample).split(/\s+/).filter(Boolean)
  if (sampleTokens.length === 0) return 0

  const overlap = sampleTokens.filter(token => answerTokens.has(token)).length
  return overlap / sampleTokens.length
}

const gradeConceptAnswer = (question: VoiceQuestion, answer: string) => {
  const keyPoints = question.key_points || []
  if (keyPoints.length > 0) {
    const { score, matched, missing } = scoreKeyPoints(answer, keyPoints)
    return {
      score,
      isCorrect: score >= 0.6,
      matched,
      missing,
    }
  }

  const sample = question.sample_answer || ''
  const score = sample ? scoreSampleAnswer(answer, sample) : 0
  return {
    score,
    isCorrect: score >= 0.5,
    matched: [],
    missing: [],
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    const body = await request.json()
    const payload = toolSchema.parse(body)

    let args: Record<string, any> = {}
    if (typeof payload.arguments === 'string') {
      try {
        args = JSON.parse(payload.arguments || '{}')
      } catch (parseError) {
        return NextResponse.json(
          {
            call_id: payload.call_id,
            output: JSON.stringify({ error: 'Invalid tool arguments' }),
          },
          { status: 400 }
        )
      }
    } else {
      args = payload.arguments
    }

    const sessionId = args.session_id as string | undefined
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }

    const session = await prisma.voiceDrillSession.findFirst({
      where: {
        id: sessionId,
        userId: auth.user.id,
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const questionSet = Array.isArray(session.questionSet)
      ? (session.questionSet as VoiceQuestion[])
      : []

    if (payload.name === 'get_next_question') {
      const parsedArgs = getNextQuestionArgsSchema.safeParse(args)
      if (!parsedArgs.success) {
        return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({ error: 'Invalid arguments for get_next_question' }),
        })
      }
      if (session.endedAt) {
        return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({ done: true, message: 'Drill complete.' }),
        })
      }
      const attempts = await prisma.voiceDrillAttempt.findMany({
        where: { sessionId },
        select: { questionIndex: true },
      })
      const attempted = new Set(attempts.map(a => a.questionIndex))
      let nextIndex = 0
      while (attempted.has(nextIndex) && nextIndex < questionSet.length) {
        nextIndex += 1
      }
      const nextQuestion = questionSet[nextIndex]

      if (!nextQuestion) {
        await prisma.voiceDrillSession.update({
          where: { id: sessionId },
          data: { endedAt: new Date(), status: 'ended' },
        })
        return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({ done: true, message: 'Drill complete.' }),
        })
      }

      return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({
            done: false,
            question_index: nextIndex,
            question: {
              question_text: nextQuestion.question_text,
              question_type: nextQuestion.question_type,
            options: nextQuestion.options || [],
            concepts_tested: nextQuestion.concepts_tested || [],
          },
        }),
      })
    }

    if (payload.name === 'record_answer') {
      const parsedArgs = recordAnswerArgsSchema.safeParse(args)
      if (!parsedArgs.success) {
        return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({ error: 'Invalid arguments for record_answer' }),
        })
      }
      const questionIndex = parsedArgs.data.question_index
      const userAnswer = parsedArgs.data.user_answer
      if (session.endedAt) {
        return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({ done: true, message: 'Drill complete.' }),
        })
      }
      const question = questionSet[questionIndex]

      if (!question) {
        return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({ error: 'Question not found' }),
        })
      }

      const inferredTopicId = getTopicIdFromQuestion(question) || session.topicId

      const grading = gradeConceptAnswer(question, userAnswer)
      const feedback = {
        matched: grading.matched,
        missing: grading.missing,
        explanation: question.explanation || '',
      }

      await prisma.voiceDrillAttempt.upsert({
        where: {
          sessionId_questionIndex: {
            sessionId,
            questionIndex,
          },
        },
        update: {
          userAnswer,
          isCorrect: grading.isCorrect,
          score: grading.score,
          feedback,
          timing: {
            received_at: new Date().toISOString(),
          },
        },
        create: {
          sessionId,
          userId: auth.user.id,
          topicId: inferredTopicId,
          questionIndex,
          questionType: question.question_type,
          questionText: question.question_text,
          expectedAnswer: {
            key_points: question.key_points || [],
            sample_answer: question.sample_answer || '',
          },
          userAnswer,
          isCorrect: grading.isCorrect,
          score: grading.score,
          feedback,
          timing: {
            received_at: new Date().toISOString(),
          },
        },
      })

      if (inferredTopicId) {
        await recordLearningSignal({
          userId: auth.user.id,
          projectId: session.projectId,
          topicId: inferredTopicId,
          source: 'voice',
          score: grading.score,
          metadata: {
            sessionId,
            questionIndex,
          },
        })

        const mastery = await computeTopicMastery(auth.user.id, session.projectId, inferredTopicId)
        await upsertReviewSchedule({
          userId: auth.user.id,
          projectId: session.projectId,
          topicId: inferredTopicId,
          mastery: mastery.mastery,
          wasCorrect: grading.isCorrect,
        })
      }

      return NextResponse.json({
        call_id: payload.call_id,
        output: JSON.stringify({
          is_correct: grading.isCorrect,
          score: grading.score,
          feedback,
        }),
      })
    }

    if (payload.name === 'get_hint') {
      const parsedArgs = getHintArgsSchema.safeParse(args)
      if (!parsedArgs.success) {
        return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({ error: 'Invalid arguments for get_hint' }),
        })
      }
      const questionIndex = parsedArgs.data.question_index
      const question = questionSet[questionIndex]
      if (!question) {
        return NextResponse.json({
          call_id: payload.call_id,
          output: JSON.stringify({ error: 'Question not found' }),
        })
      }

      return NextResponse.json({
        call_id: payload.call_id,
        output: JSON.stringify({
          hint: question.key_points?.slice(0, 3) || [],
          sample_answer: question.sample_answer || '',
        }),
      })
    }

    return NextResponse.json({
      call_id: payload.call_id,
      output: JSON.stringify({ error: 'Unknown tool' }),
    })
  } catch (error) {
    console.error('Tool execution error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Failed to execute tool' }, { status: 500 })
  }
}
