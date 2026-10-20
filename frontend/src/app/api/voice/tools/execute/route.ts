import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { VoiceQuestion } from '@/lib/voice/concept'
import { buildHint, toGradableQuestion } from '@/lib/voice/grading'
import { gradeAnswers, GradingUnavailableError } from '@/lib/ai-service/grading'
import { createRateLimiter } from '@/lib/api/rate-limit'
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
  user_answer: z.string().min(1).max(5000),
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

// Each answer costs a model call, so a session cannot be hammered with them.
const answerLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 })

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

      // The server grades the spoken answer; the model's own claim about it counts for
      // nothing. A direct call with arbitrary text is graded like any other answer.
      const gradable = toGradableQuestion(question)
      let grading: { score: number; isCorrect: boolean; comment: string; ungraded: boolean }
      if (gradable) {
        const rate = answerLimiter.check(auth.user.id)
        if (!rate.ok) {
          return NextResponse.json({
            call_id: payload.call_id,
            output: JSON.stringify({ error: 'Too many answers too quickly. Wait a moment and try again.' }),
          })
        }
        try {
          const result = await gradeAnswers([gradable], { '0': userAnswer })
          const graded = result.graded_questions[0]
          grading = {
            score: graded.points_possible > 0 ? graded.points_earned / graded.points_possible : 0,
            isCorrect: graded.is_correct,
            comment: graded.feedback,
            ungraded: false,
          }
        } catch (gradeError) {
          if (gradeError instanceof GradingUnavailableError) {
            // Nothing is stored: a failed grading call must not become a score.
            return NextResponse.json({
              call_id: payload.call_id,
              output: JSON.stringify({
                error: 'Grading is unavailable right now. Do not give a score. Tell the learner and offer to try again.',
              }),
            })
          }
          throw gradeError
        }
      } else {
        // No sample answer or key points to grade against: record it, but as ungraded.
        grading = {
          score: 0,
          isCorrect: false,
          comment: 'This question has no answer key, so it was not graded.',
          ungraded: true,
        }
      }
      const feedback = {
        comment: grading.comment,
        explanation: question.explanation || '',
        ...(grading.ungraded ? { ungraded: true } : {}),
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

      // An ungraded answer is not evidence of anything, so it adds no signal.
      if (inferredTopicId && !grading.ungraded) {
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

      // A nudge built from the shape of the question. The sample answer and key points
      // stay on the server: this tool must not hand over the answer.
      return NextResponse.json({
        call_id: payload.call_id,
        output: JSON.stringify(buildHint(question)),
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
