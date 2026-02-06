'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookText, Headphones, Languages, ListChecks, MessageSquareText, Mic, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const TOOL_DEFS = [
  {
    type: 'function',
    name: 'get_next_question',
    description: 'Fetch the next conceptual question for the drill session.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Voice drill session id' },
      },
      required: ['session_id'],
    },
  },
  {
    type: 'function',
    name: 'record_answer',
    description: 'Record the user answer and return conceptual feedback.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Voice drill session id' },
        question_index: { type: 'number', description: 'Index of the question in the drill' },
        user_answer: { type: 'string', description: 'User spoken answer' },
      },
      required: ['session_id', 'question_index', 'user_answer'],
    },
  },
  {
    type: 'function',
    name: 'get_hint',
    description: 'Provide a conceptual hint for the current question.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Voice drill session id' },
        question_index: { type: 'number', description: 'Index of the current question' },
      },
      required: ['session_id', 'question_index'],
    },
  },
]

type VoiceLearningStyle = 'oral_quiz' | 'guided_notes' | 'topic_conversation'

const STYLE_LABELS: Record<VoiceLearningStyle, string> = {
  oral_quiz: 'Oral Q&A',
  guided_notes: 'Guided Notes',
  topic_conversation: 'Topic Conversation',
}

const STYLE_ICONS: Record<VoiceLearningStyle, typeof ListChecks> = {
  oral_quiz: ListChecks,
  guided_notes: BookText,
  topic_conversation: MessageSquareText,
}

const STYLE_DESCRIPTIONS: Record<VoiceLearningStyle, string> = {
  oral_quiz: 'One question at a time with answer checking and feedback.',
  guided_notes: 'Coach explains notes first, then checks understanding.',
  topic_conversation: 'Free conversation anchored to this topic only.',
}

type VoiceCoachProps = {
  mode: 'topic_drill' | 'sprint'
  projectId: string
  topicId?: string
  title?: string
  topicName?: string
  topicDescription?: string | null
  contextText?: string
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  hi: 'Hindi',
  ja: 'Japanese',
}

const YES_PATTERN = /\b(yes|yeah|yep|sure|ok|okay|si|sí|oui|ja|sim)\b/i
const NO_PATTERN = /\b(no|nope|nah|not now|english)\b/i

const extractNestedErrorMessage = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed || !trimmed.includes('{')) return null
  const start = trimmed.indexOf('{')
  const candidate = trimmed.slice(start)
  try {
    const parsed = JSON.parse(candidate)
    if (typeof parsed?.error?.message === 'string') {
      return parsed.error.message
    }
    if (typeof parsed?.detail === 'string') {
      const nested = extractNestedErrorMessage(parsed.detail)
      return nested || parsed.detail
    }
  } catch {
    return null
  }
  return null
}

const normalizeErrorMessage = (raw: string | null | undefined): string => {
  const fallback = (raw || '').trim()
  if (!fallback) return 'Unknown error'
  const nested = extractNestedErrorMessage(fallback)
  return nested || fallback
}

export function VoiceCoach({
  mode,
  projectId,
  topicId,
  title,
  topicName,
  topicDescription,
  contextText,
}: VoiceCoachProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [questionCount, setQuestionCount] = useState<number | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)
  const [pendingConnect, setPendingConnect] = useState(false)
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [generatingContent, setGeneratingContent] = useState(false)
  const [generationNotice, setGenerationNotice] = useState<string | null>(null)
  const [languageMode, setLanguageMode] = useState<'english_only' | 'auto_confirm'>('english_only')
  const [preferredLanguage, setPreferredLanguage] = useState('en')
  const [languageNotice, setLanguageNotice] = useState<string | null>(null)
  const [learningStyle, setLearningStyle] = useState<VoiceLearningStyle>('oral_quiz')
  const [customFocus, setCustomFocus] = useState('')
  const [lastEvaluation, setLastEvaluation] = useState<{
    isCorrect: boolean
    score: number
    matched: string[]
    missing: string[]
    explanation: string
  } | null>(null)
  const [currentQuestionZeroBased, setCurrentQuestionZeroBased] = useState<number | null>(null)
  const [evaluatingAnswer, setEvaluatingAnswer] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previousConnectionRef = useRef<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const sessionEndedRef = useRef(false)
  const lastDetectedLanguageRef = useRef<string>('en')
  const detectedLanguageCountRef = useRef(0)
  const askedLanguageRef = useRef<Set<string>>(new Set())
  const pendingLanguageConfirmRef = useRef<string | null>(null)

  const selectedLanguageLabel = LANGUAGE_LABELS[preferredLanguage] || preferredLanguage
  const activeTools = learningStyle === 'topic_conversation' ? [] : TOOL_DEFS
  const styleInstruction = learningStyle === 'oral_quiz'
    ? `Mode: Oral Q&A.
- Ask exactly one question at a time.
- Always call get_next_question before asking a new question.
- Ask only the question text returned by the tool. Never invent a question from memory.
- After each learner answer, call record_answer with the current question index.
- Give concise feedback based on tool output, then ask if they want the next question.`
    : learningStyle === 'guided_notes'
      ? `Mode: Guided Notes.
- Start by teaching from the provided topic context in 3-5 concise bullet points.
- Keep explanations intuitive and conceptual.
- Offer an optional check question when useful.
- If learner asks for a check question, call get_next_question and then record_answer after they answer.`
      : `Mode: Topic Conversation.
- Keep this as a conversation, not a fixed quiz.
- Stay strictly within the topic context below.
- If asked unrelated content, say it is out of scope and redirect to this topic.`

  const trimmedFocus = customFocus.trim()
  const trimmedContext = (contextText || '').trim()
  const coachInstructions = [
    'You are StudyBuddy voice coach.',
    `Primary topic: ${topicName || 'current study topic'}.`,
    topicDescription ? `Topic description: ${topicDescription}` : null,
    `Preferred speaking language: ${selectedLanguageLabel}.`,
    'Never switch to an unrelated subject.',
    'No calculations, equations, formulas, or numeric problem solving unless learner explicitly asks for computation practice.',
    'Focus on definitions, intuition, relationships, trade-offs, comparisons, and reasoning.',
    styleInstruction,
    trimmedFocus ? `Learner requested focus: ${trimmedFocus}` : null,
    trimmedContext
      ? `Topic context (authoritative; stay within this scope):\n${trimmedContext.slice(0, 7000)}`
      : null,
    sessionId ? `Session id: ${sessionId}. Include session_id in tool calls.` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const initialPrompt = learningStyle === 'oral_quiz'
    ? `Start the oral drill for "${topicName || 'this topic'}". First, call get_next_question and ask exactly that question.`
    : learningStyle === 'guided_notes'
      ? `Start with a concise conceptual summary of "${topicName || 'this topic'}" using the provided context, then ask which part the learner wants to focus on.`
      : `Start a focused conversation on "${topicName || 'this topic'}". Ask what the learner wants to clarify first.`

  const patchSession = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!sessionId) return
      try {
        await fetch('/api/voice/session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            ...payload,
          }),
        })
      } catch {
        // Keep live session resilient even if persistence fails.
      }
    },
    [sessionId]
  )

  const {
    connection,
    status,
    error,
    conversation,
    userInterim,
    assistantInterim,
    metrics,
    micLevel,
    connect,
    disconnect,
    sendResponseCreate,
    resetMetrics,
  } = useRealtimeVoice({
    sessionId,
    instructions: coachInstructions,
    initialPrompt,
    tools: activeTools,
    language: preferredLanguage,
    languageMode,
    audioRef,
    onInterrupt: () => {
      patchSession({ incrementInterruptCount: 1 })
    },
    onDetectedLanguage: (language, transcript) => {
      patchSession({ lastDetectedLanguage: language })

      const pendingLanguage = pendingLanguageConfirmRef.current
      if (pendingLanguage) {
        if (YES_PATTERN.test(transcript)) {
          setPreferredLanguage(pendingLanguage)
          setLanguageNotice(
            `Language switched to ${LANGUAGE_LABELS[pendingLanguage] || pendingLanguage}.`
          )
          pendingLanguageConfirmRef.current = null
          sendResponseCreate(
            `Continue in ${LANGUAGE_LABELS[pendingLanguage] || pendingLanguage}. Keep the drill conceptual only.`,
            true
          )
          return
        }

        if (NO_PATTERN.test(transcript)) {
          setLanguageNotice(`Staying in ${selectedLanguageLabel}.`)
          pendingLanguageConfirmRef.current = null
          return
        }
      }

      if (languageMode === 'english_only') {
        if (language !== preferredLanguage) {
          setLanguageNotice(
            `Detected ${LANGUAGE_LABELS[language] || language}. Fixed-language mode is enabled, so the coach will continue in ${selectedLanguageLabel}.`
          )
        }
        return
      }

      if (language === 'en') {
        detectedLanguageCountRef.current = 0
        lastDetectedLanguageRef.current = language
        return
      }

      if (lastDetectedLanguageRef.current === language) {
        detectedLanguageCountRef.current += 1
      } else {
        lastDetectedLanguageRef.current = language
        detectedLanguageCountRef.current = 1
      }

      if (detectedLanguageCountRef.current >= 2 && !askedLanguageRef.current.has(language)) {
        askedLanguageRef.current.add(language)
        pendingLanguageConfirmRef.current = language
        const label = LANGUAGE_LABELS[language] || language
        setLanguageNotice(`I’m hearing ${label}. Confirm if you want to continue in ${label}.`)
        sendResponseCreate(
          `I’m hearing ${label}. Do you want to continue in ${label}? Ask for a yes or no before proceeding.`,
          true
        )
      }
    },
    onToolOutput: (output) => {
      if (output.name === 'get_next_question') {
        if (output.payload?.done) {
          setCurrentIndex(questionCount ?? null)
          setCurrentQuestionZeroBased(null)
        } else if (typeof output.payload?.question_index === 'number') {
          setCurrentQuestionZeroBased(output.payload.question_index)
          setCurrentIndex(output.payload.question_index + 1)
          setLastEvaluation(null)
        }
      } else if (output.name === 'record_answer') {
        const payload = output.payload || {}
        setLastEvaluation({
          isCorrect: Boolean(payload.is_correct),
          score: Number(payload.score || 0),
          matched: Array.isArray(payload.feedback?.matched) ? payload.feedback.matched : [],
          missing: Array.isArray(payload.feedback?.missing) ? payload.feedback.missing : [],
          explanation:
            typeof payload.feedback?.explanation === 'string'
              ? payload.feedback.explanation
              : '',
        })
      }
    },
    onMetrics: async (entry) => {
      if (sessionId) {
        try {
          await fetch('/api/voice/metrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, entry }),
          })
        } catch {
          // Keep the drill running even if metrics storage fails.
        }
      }
    },
  })

  const createSession = async () => {
    setLoadingSession(true)
    setSessionError(null)
    setLanguageNotice(null)
    sessionEndedRef.current = false
    askedLanguageRef.current = new Set()
    detectedLanguageCountRef.current = 0
    lastDetectedLanguageRef.current = 'en'
    pendingLanguageConfirmRef.current = null

    try {
      const response = await fetch('/api/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          projectId,
          topicId,
          language: preferredLanguage,
          voice: 'marin',
          style: learningStyle,
        }),
      })

      if (response.status === 422) {
        const data = await response.json().catch(() => ({}))
        setSessionError(data?.error?.message || 'No conceptual questions available.')
        setSessionId(null)
        setQuestionCount(null)
        return null
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to create session')
      }

      const data = await response.json()
      setSessionId(data.sessionId)
      setQuestionCount(data.questionCount)
      setCurrentIndex(0)
      return data.sessionId as string
    } catch (err: any) {
      setSessionError(err?.message || 'Failed to create session')
      return null
    } finally {
      setLoadingSession(false)
    }
  }

  const handleConnect = async () => {
    if (connection !== 'disconnected') return
    if (!sessionId) {
      setPendingConnect(true)
      const newSession = await createSession()
      if (!newSession) {
        setPendingConnect(false)
      }
      return
    }
    await connect()
  }

  const handleDisconnect = async () => {
    if (sessionId && !sessionEndedRef.current) {
      await patchSession({ status: 'aborted' })
      sessionEndedRef.current = true
    }
    disconnect()
  }

  const handleNewSession = async () => {
    if (sessionId && !sessionEndedRef.current) {
      await patchSession({ status: 'aborted' })
      sessionEndedRef.current = true
    }
    disconnect()
    resetMetrics()
    setSessionId(null)
    setQuestionCount(null)
    setCurrentIndex(null)
    setCurrentQuestionZeroBased(null)
    setSessionError(null)
    setGenerationNotice(null)
    setLanguageNotice(null)
    setLastEvaluation(null)
    pendingLanguageConfirmRef.current = null
  }

  const handleGenerateContent = async () => {
    if (!topicId) return
    setGeneratingContent(true)
    setGenerationNotice(null)

    try {
      const generate = async (contentType: 'section_notes' | 'topic_quiz') => {
        const response = await fetch(`/api/topics/${topicId}/generate-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType, preferences: {} }),
        })

        if (!response.ok) {
          throw new Error(`Failed to generate ${contentType}`)
        }
      }

      await Promise.all([
        generate('section_notes'),
        generate('topic_quiz'),
      ])

      setGenerationNotice('Generation started. Check back once content is ready.')
    } catch (err: any) {
      setSessionError(err?.message || 'Failed to start content generation')
    } finally {
      setGeneratingContent(false)
    }
  }

  const handleValidateLastAnswer = async () => {
    if (!sessionId || currentQuestionZeroBased === null) {
      setLanguageNotice('No active question to validate yet.')
      return
    }

    const lastUserMessage = [...conversation].reverse().find((entry) => entry.role === 'user')
    const userAnswer = lastUserMessage?.text?.trim()
    if (!userAnswer) {
      setLanguageNotice('No recent learner answer found to validate.')
      return
    }

    setEvaluatingAnswer(true)
    try {
      const callId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`

      const response = await fetch('/api/voice/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: callId,
          name: 'record_answer',
          arguments: JSON.stringify({
            session_id: sessionId,
            question_index: currentQuestionZeroBased,
            user_answer: userAnswer,
          }),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to validate answer')
      }

      const data = await response.json()
      const payload = typeof data?.output === 'string' ? JSON.parse(data.output) : data?.output
      setLastEvaluation({
        isCorrect: Boolean(payload?.is_correct),
        score: Number(payload?.score || 0),
        matched: Array.isArray(payload?.feedback?.matched) ? payload.feedback.matched : [],
        missing: Array.isArray(payload?.feedback?.missing) ? payload.feedback.missing : [],
        explanation: typeof payload?.feedback?.explanation === 'string' ? payload.feedback.explanation : '',
      })
      sendResponseCreate('Provide concise spoken feedback for the validated answer and suggest the next step.', true)
    } catch (validationError: any) {
      setSessionError(validationError?.message || 'Failed to validate answer')
    } finally {
      setEvaluatingAnswer(false)
    }
  }

  useEffect(() => {
    if (pendingConnect && sessionId) {
      connect()
      setPendingConnect(false)
    }
  }, [pendingConnect, sessionId, connect])

  useEffect(() => {
    const prev = previousConnectionRef.current
    if (prev !== connection) {
      if (connection === 'connected' && sessionId) {
        patchSession({ status: 'active' })
      } else if (prev === 'connected' && connection === 'disconnected' && sessionId && !sessionEndedRef.current) {
        patchSession({ status: 'aborted' })
        sessionEndedRef.current = true
      }
      previousConnectionRef.current = connection
    }
  }, [connection, patchSession, sessionId])

  useEffect(() => {
    if (
      questionCount !== null &&
      currentIndex !== null &&
      currentIndex >= questionCount &&
      sessionId &&
      !sessionEndedRef.current
    ) {
      sessionEndedRef.current = true
      patchSession({ status: 'ended' })
    }
  }, [currentIndex, patchSession, questionCount, sessionId])

  const formatMs = (value?: number) =>
    typeof value === 'number' ? `${Math.round(value)} ms` : '—'
  const visibleError = normalizeErrorMessage(sessionError || error)

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {title || 'Voice Coach'}
            </CardTitle>
            <CardDescription>
              Topic-grounded voice learning with quiz, notes coaching, or open conversation modes.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="h-fit">
            {STYLE_LABELS[learningStyle]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-border/70 bg-white/70 p-4 space-y-4">
          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Session Style</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STYLE_LABELS) as VoiceLearningStyle[]).map((style) => {
              const Icon = STYLE_ICONS[style]
              const active = learningStyle === style
              return (
                <Button
                  key={style}
                  type="button"
                  variant="outline"
                  onClick={() => setLearningStyle(style)}
                  className={cn(
                    'rounded-xl border',
                    active
                      ? 'border-primary/80 bg-primary !text-white hover:bg-primary/95 hover:!text-white [&_*]:!text-white'
                      : 'border-border/70 bg-white/80 text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {STYLE_LABELS[style]}
                </Button>
              )
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            {STYLE_DESCRIPTIONS[learningStyle]}
          </p>
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-2">
              Focus (optional)
            </div>
            <Input
              value={customFocus}
              onChange={(event) => setCustomFocus(event.target.value)}
              placeholder="e.g., more on stack layout, ASLR bypass intuition, mitigation trade-offs"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-white/70 p-4">
            <div className="text-xs uppercase text-muted-foreground">Session</div>
            <div className="mt-2 text-lg font-semibold capitalize">{status}</div>
            <div className="text-sm text-muted-foreground">
              {connection === 'connected' ? 'Connected' : 'Idle'}
            </div>
            {sessionId && (
              <div className="mt-1 text-xs text-muted-foreground">
                Session: {sessionId.slice(0, 8)}...
              </div>
            )}
            {questionCount !== null && (
              <div className="mt-2 text-sm text-muted-foreground">
                {questionCount} prompts loaded
                {currentIndex !== null && questionCount > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Prompt {Math.min(currentIndex, questionCount)} of {questionCount}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border/70 bg-white/70 p-4">
            <div className="text-xs uppercase text-muted-foreground">Latency</div>
            <div className="mt-2 space-y-1 text-sm">
              <div>TTFT: {formatMs(metrics.ttftMs)}</div>
              <div>TTFA: {formatMs(metrics.ttfaMs)}</div>
              <div>Response: {formatMs(metrics.responseMs)}</div>
              <div>Tool latency: {formatMs(metrics.toolLatencyMs)}</div>
              <div>Interrupts: {metrics.interrupts || 0}</div>
              <div>Tool failures: {metrics.toolFailures || 0}</div>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-white/70 p-4 space-y-3">
            <div className="text-xs uppercase text-muted-foreground">Language</div>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLanguageMode('english_only')
                    pendingLanguageConfirmRef.current = null
                  }}
                  className={cn(
                    languageMode === 'english_only'
                      ? 'border-primary/80 bg-primary text-primary-foreground hover:bg-primary/95 hover:text-primary-foreground [&_*]:text-primary-foreground'
                      : ''
                  )}
                >
                  Fixed Language
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setLanguageMode('auto_confirm')}
                  className={cn(
                    languageMode === 'auto_confirm'
                      ? 'border-primary/80 bg-primary text-primary-foreground hover:bg-primary/95 hover:text-primary-foreground [&_*]:text-primary-foreground'
                      : ''
                  )}
                >
                  Auto-detect
                </Button>
              </div>
              <select
                className="w-full rounded-xl border border-border/70 bg-white/80 px-2.5 py-2 text-sm"
                value={preferredLanguage}
                onChange={(event) => setPreferredLanguage(event.target.value)}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
                <option value="it">Italian</option>
                <option value="hi">Hindi</option>
                <option value="ja">Japanese</option>
              </select>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Languages className="h-3 w-3" />
                Preferred: {selectedLanguageLabel}
              </div>
            </div>
          </div>
        </div>

        {(sessionError || error) && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-2">
            <div>{visibleError}</div>
            {sessionError && topicId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateContent}
                disabled={generatingContent}
              >
                {generatingContent ? 'Generating...' : 'Generate notes + quiz'}
              </Button>
            )}
          </div>
        )}

        {languageNotice && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            {languageNotice}
          </div>
        )}

        {generationNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {generationNotice}
          </div>
        )}

        {lastEvaluation && (
          <div
            className={`rounded-xl border p-3 text-sm ${
              lastEvaluation.isCorrect
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            <div className="font-semibold">
              {lastEvaluation.isCorrect ? 'Answer evaluated: correct' : 'Answer evaluated: needs improvement'}
              {' • '}
              {Math.round(lastEvaluation.score * 100)}%
            </div>
            {lastEvaluation.matched.length > 0 && (
              <div className="mt-1">
                Matched: {lastEvaluation.matched.join(', ')}
              </div>
            )}
            {lastEvaluation.missing.length > 0 && (
              <div className="mt-1">
                Missing: {lastEvaluation.missing.join(', ')}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleConnect} disabled={loadingSession || connection === 'connected'}>
            <Mic className="mr-2 h-4 w-4" />
            {loadingSession
              ? 'Preparing...'
              : `Start Voice ${mode === 'sprint' ? 'Sprint' : 'Drill'}`}
          </Button>
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={connection !== 'connected'}
          >
            <Headphones className="mr-2 h-4 w-4" />
            Disconnect
          </Button>
          <Button variant="ghost" onClick={handleNewSession}>
            <RefreshCw className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </div>

        {learningStyle === 'oral_quiz' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                sendResponseCreate(
                  `Call get_next_question using session_id "${sessionId || ''}" and ask exactly that question.`,
                  true
                )
              }
              disabled={connection !== 'connected'}
            >
              Next Question
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendResponseCreate('Repeat the current question one time, then wait for the learner answer.', true)}
              disabled={connection !== 'connected'}
            >
              Repeat Question
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                sendResponseCreate(
                  `Call get_hint for question_index ${currentQuestionZeroBased ?? 0} and provide one concise conceptual hint.`,
                  true
                )
              }
              disabled={connection !== 'connected'}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Hint
            </Button>
            <Button
              variant="secondary"
              onClick={handleValidateLastAnswer}
              disabled={connection !== 'connected' || evaluatingAnswer}
            >
              {evaluatingAnswer ? 'Validating...' : 'Validate Answer'}
            </Button>
          </div>
        ) : learningStyle === 'guided_notes' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => sendResponseCreate('Give a concise recap of the key ideas from the topic context.', true)}
              disabled={connection !== 'connected'}
            >
              Recap
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                sendResponseCreate(
                  `Ask one conceptual check question about the current topic. Use get_next_question with session_id "${sessionId || ''}" when appropriate.`,
                  true
                )
              }
              disabled={connection !== 'connected'}
            >
              Check Question
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendResponseCreate('Ask what concept is still confusing and clarify it with one practical example.', true)}
              disabled={connection !== 'connected'}
            >
              Clarify
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => sendResponseCreate('Go one level deeper on the current concept in plain language.', true)}
              disabled={connection !== 'connected'}
            >
              Go Deeper
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendResponseCreate('Give one real-world example tied to this topic.', true)}
              disabled={connection !== 'connected'}
            >
              Example
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendResponseCreate('Summarize this conversation into 3 exam-ready bullet points.', true)}
              disabled={connection !== 'connected'}
            >
              Summarize
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-border/70 bg-white/70 p-4">
          <div className="text-xs uppercase text-muted-foreground">Mic Level</div>
          <Progress value={Math.min(micLevel * 150, 100)} className="mt-3" />
          <div className="mt-2 text-sm text-muted-foreground">
            Speak over the coach to barge in. Audio is canceled immediately.
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-white/70 p-4">
          <div className="text-xs uppercase text-muted-foreground">Conversation</div>
          <div className="mt-3 space-y-3 text-sm">
            {conversation.length === 0 && !assistantInterim && !userInterim && (
              <div className="text-muted-foreground">
                {learningStyle === 'oral_quiz'
                  ? 'Say "start" to begin the first question.'
                  : learningStyle === 'guided_notes'
                    ? 'Say what part of the topic you want explained first.'
                    : 'Ask anything about this topic to start the conversation.'}
              </div>
            )}
            {conversation.map((message) => (
              <div key={message.id} className="space-y-1">
                <div className="text-xs uppercase text-muted-foreground">{message.role}</div>
                <div
                  className={`rounded-md px-3 py-2 ${
                    message.role === 'assistant'
                      ? 'bg-blue-50 border border-blue-100'
                      : 'bg-slate-50 border border-slate-100'
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {userInterim && (
              <div className="space-y-1">
                <div className="text-xs uppercase text-muted-foreground">User (listening)</div>
                <div className="rounded-md bg-slate-50 border border-slate-100 px-3 py-2 text-muted-foreground">
                  {userInterim}
                </div>
              </div>
            )}
            {assistantInterim && (
              <div className="space-y-1">
                <div className="text-xs uppercase text-muted-foreground">Coach (speaking)</div>
                <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
                  {assistantInterim}
                </div>
              </div>
            )}
          </div>
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />
      </CardContent>
    </Card>
  )
}
