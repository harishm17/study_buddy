'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected'

export type MetricState = {
  ttftMs?: number
  ttfaMs?: number
  speechMs?: number
  responseMs?: number
  toolLatencyMs?: number
  toolFailures?: number
  interrupts?: number
  lastDetectedLanguage?: string
}

export type ToolOutput = {
  name: string
  payload: any
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type UseRealtimeVoiceOptions = {
  sessionId: string | null
  instructions: string
  initialPrompt?: string
  tools: any[]
  language?: string
  languageMode?: 'english_only' | 'auto_confirm'
  audioRef: RefObject<HTMLAudioElement>
  onMetrics?: (entry: MetricState) => void
  onToolOutput?: (output: ToolOutput) => void
  onInterrupt?: () => void
  onDetectedLanguage?: (language: string, transcript: string) => void
}

const DEFAULT_TRANSCRIPTION = 'gpt-4o-mini-transcribe'
const DEFAULT_REALTIME_MODEL = 'gpt-realtime-mini'
const MAX_CONVERSATION_MESSAGES = 120

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const detectLikelyLanguage = (transcript: string): string => {
  const value = transcript.toLowerCase()
  if (!value.trim()) return 'en'

  const languageHints: Array<{ code: string; pattern: RegExp }> = [
    { code: 'es', pattern: /\b(el|la|los|las|de|que|por|para|gracias|hola|como|est[aá]|donde)\b/i },
    { code: 'fr', pattern: /\b(le|la|les|des|et|bonjour|merci|avec|pour|être|où)\b/i },
    { code: 'de', pattern: /\b(der|die|das|und|ist|nicht|danke|bitte|wie|wo)\b/i },
    { code: 'pt', pattern: /\b(o|a|os|as|de|que|obrigado|ol[aá]|como|est[aá])\b/i },
  ]

  for (const hint of languageHints) {
    if (hint.pattern.test(value)) {
      return hint.code
    }
  }
  return 'en'
}

const normalizeTools = (rawTools: any[]) => {
  if (!Array.isArray(rawTools)) return []

  return rawTools
    .map((tool) => {
      if (!tool || typeof tool !== 'object') return null
      const name = typeof tool.name === 'string' ? tool.name.trim() : ''
      if (!name) return null

      const description = typeof tool.description === 'string'
        ? tool.description
        : 'Tool available to support the study session.'

      const parameters = tool.parameters && typeof tool.parameters === 'object'
        ? tool.parameters
        : { type: 'object', properties: {}, required: [] }

      return {
        type: 'function',
        name,
        description,
        parameters,
      }
    })
    .filter((tool): tool is {
      type: 'function'
      name: string
      description: string
      parameters: Record<string, unknown>
    } => tool !== null)
}

export const useRealtimeVoice = ({
  sessionId,
  instructions,
  initialPrompt,
  tools,
  language = 'en',
  languageMode = 'english_only',
  audioRef,
  onMetrics,
  onToolOutput,
  onInterrupt,
  onDetectedLanguage,
}: UseRealtimeVoiceOptions) => {
  const [connection, setConnection] = useState<ConnectionState>('disconnected')
  const [status, setStatus] = useState('Idle')
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<ChatMessage[]>([])
  const [userInterim, setUserInterim] = useState('')
  const [assistantInterim, setAssistantInterim] = useState('')
  const [metrics, setMetrics] = useState<MetricState>({})
  const [micLevel, setMicLevel] = useState(0)
  const metricsRef = useRef<MetricState>({})
  const userInterimRef = useRef('')
  const assistantInterimRef = useRef('')

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const duckTimeoutRef = useRef<number | null>(null)

  const lastSpeechStartRef = useRef<number | null>(null)
  const lastSpeechStopRef = useRef<number | null>(null)
  const firstTranscriptSeenRef = useRef(false)
  const awaitingAudioRef = useRef(false)
  const assistantSpeakingRef = useRef(false)
  const responseActiveRef = useRef(false)
  const lastAssistantItemIdRef = useRef<string | null>(null)
  const assistantAudioStartRef = useRef<number | null>(null)
  const lastBargeInRef = useRef<number>(0)
  const pendingResponsePromptRef = useRef<string | null>(null)
  const didSendInitialPromptRef = useRef(false)
  const metricsDirtyRef = useRef(false)

  const toolSpec = useMemo(() => normalizeTools(tools), [tools])

  const resetMetrics = useCallback(() => {
    setMetrics({})
    lastSpeechStartRef.current = null
    lastSpeechStopRef.current = null
    firstTranscriptSeenRef.current = false
    awaitingAudioRef.current = false
    assistantAudioStartRef.current = null
    metricsDirtyRef.current = false
  }, [])

  useEffect(() => {
    metricsRef.current = metrics
  }, [metrics])

  useEffect(() => {
    userInterimRef.current = userInterim
  }, [userInterim])

  useEffect(() => {
    assistantInterimRef.current = assistantInterim
  }, [assistantInterim])

  const appendConversation = useCallback((role: 'user' | 'assistant', text: string) => {
    if (!text.trim()) return
    setConversation(prev => {
      const next = [...prev, { id: createId(), role, text }]
      return next.slice(-MAX_CONVERSATION_MESSAGES)
    })
  }, [])

  const sendEvent = useCallback((event: Record<string, any>) => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') return
    dcRef.current.send(JSON.stringify(event))
  }, [])

  const sendSessionUpdate = useCallback(() => {
    const sessionLanguage = language || 'en'
    sendEvent({
      type: 'session.update',
      session: {
        type: 'realtime',
        model: DEFAULT_REALTIME_MODEL,
        instructions,
        tools: toolSpec,
        tool_choice: toolSpec.length > 0 ? 'auto' : 'none',
        audio: {
          input: {
            transcription: {
              model: DEFAULT_TRANSCRIPTION,
              language: sessionLanguage,
            },
            turn_detection: {
              type: 'server_vad',
              create_response: true,
              interrupt_response: true,
            },
          },
        },
      },
    })
  }, [instructions, language, sendEvent, toolSpec])

  const sendResponseCreate = useCallback((prompt?: string, force = false) => {
    const nextPrompt = prompt || 'Start the next conceptual question.'
    if (responseActiveRef.current) {
      pendingResponsePromptRef.current = nextPrompt
      if (force) {
        sendEvent({ type: 'response.cancel' })
      }
      return
    }
    pendingResponsePromptRef.current = null
    sendEvent({
      type: 'response.create',
      response: {
        instructions: nextPrompt,
      },
    })
  }, [sendEvent])

  const handleToolCall = useCallback(
    async (event: any) => {
      if (!sessionId) return
      try {
        const toolStartedAt = performance.now()
        let parsedArgs: Record<string, any> = {}
        try {
          parsedArgs = typeof event.arguments === 'string'
            ? JSON.parse(event.arguments || '{}')
            : (event.arguments || {})
        } catch (err) {
          parsedArgs = {}
        }

        if (!parsedArgs.session_id) {
          parsedArgs.session_id = sessionId
        }

        const response = await fetch('/api/voice/tools/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: event.call_id,
            name: event.name,
            arguments: JSON.stringify(parsedArgs),
          }),
        })

        let output = JSON.stringify({ error: 'Tool execution failed' })
        let callId = event.call_id as string

        if (!response.ok) {
          setError('Tool execution failed')
          setMetrics((prev) => ({
            ...prev,
            toolFailures: (prev.toolFailures || 0) + 1,
            toolLatencyMs: performance.now() - toolStartedAt,
          }))
          metricsDirtyRef.current = true
        } else {
          const data = await response.json()
          output = typeof data?.output === 'string' ? data.output : JSON.stringify(data?.output || {})
          callId = data?.call_id || event.call_id
          setMetrics((prev) => ({
            ...prev,
            toolLatencyMs: performance.now() - toolStartedAt,
          }))
          metricsDirtyRef.current = true

          if (output && onToolOutput) {
            try {
              const parsed = JSON.parse(output)
              onToolOutput({ name: event.name, payload: parsed })
            } catch (err) {
              onToolOutput({ name: event.name, payload: output })
            }
          }
        }

        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output,
          },
        })

        sendResponseCreate('Continue the drill with concise conceptual feedback.')
      } catch (toolError) {
        setError('Tool execution failed')
        setMetrics((prev) => ({
          ...prev,
          toolFailures: (prev.toolFailures || 0) + 1,
        }))
        metricsDirtyRef.current = true
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: event.call_id,
            output: JSON.stringify({ error: 'Tool execution failed' }),
          },
        })
        sendResponseCreate('Continue with a short fallback response and retry the question.')
      }
    },
    [onToolOutput, sendEvent, sendResponseCreate, sessionId]
  )

  const handleBargeIn = useCallback(() => {
    if (!assistantSpeakingRef.current) return
    const now = Date.now()
    if (now - lastBargeInRef.current < 800) return
    lastBargeInRef.current = now

    if (responseActiveRef.current) {
      responseActiveRef.current = false
      sendEvent({ type: 'response.cancel' })
    }
    sendEvent({ type: 'output_audio_buffer.clear' })

    if (lastAssistantItemIdRef.current && audioRef.current) {
      sendEvent({
        type: 'conversation.item.truncate',
        item_id: lastAssistantItemIdRef.current,
        content_index: 0,
        audio_end_ms: Math.floor(audioRef.current.currentTime * 1000),
      })
    }

    assistantSpeakingRef.current = false
    setStatus('Listening')
    onInterrupt?.()
    setMetrics((prev) => ({
      ...prev,
      interrupts: (prev.interrupts || 0) + 1,
    }))
    metricsDirtyRef.current = true
  }, [audioRef, onInterrupt, sendEvent])

  const startAnalyser = useCallback((stream: MediaStream) => {
    if (audioCtxRef.current) return

    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)

    audioCtxRef.current = audioCtx
    analyserRef.current = analyser

    const buffer = new Uint8Array(analyser.fftSize)

    const tick = () => {
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) {
        const value = (buffer[i] - 128) / 128
        sum += value * value
      }
      const rms = Math.sqrt(sum / buffer.length)
      setMicLevel(rms)

      if (assistantSpeakingRef.current && rms > 0.06) {
        if (audioRef.current) {
          audioRef.current.volume = 0.2
        }
        handleBargeIn()
        if (duckTimeoutRef.current) window.clearTimeout(duckTimeoutRef.current)
        duckTimeoutRef.current = window.setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.volume = 0.9
          }
        }, 300)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [audioRef, handleBargeIn])

  const stopAnalyser = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (duckTimeoutRef.current) window.clearTimeout(duckTimeoutRef.current)
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => null)
    }
    audioCtxRef.current = null
    analyserRef.current = null
    duckTimeoutRef.current = null
    setMicLevel(0)
  }, [])

  const cleanupConnection = useCallback(() => {
    dcRef.current?.close()
    pcRef.current?.close()
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    stopAnalyser()

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.srcObject = null
    }

    dcRef.current = null
    pcRef.current = null
    mediaStreamRef.current = null
    assistantSpeakingRef.current = false
    responseActiveRef.current = false
    didSendInitialPromptRef.current = false
    pendingResponsePromptRef.current = null
    lastAssistantItemIdRef.current = null
  }, [audioRef, stopAnalyser])

  const connect = useCallback(async () => {
    if (!sessionId || connection !== 'disconnected') return
    setConnection('connecting')
    setStatus('Connecting')
    setError(null)
    resetMetrics()

    try {
      const tokenResponse = await fetch('/api/voice/realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })

      if (!tokenResponse.ok) {
        throw new Error(await tokenResponse.text())
      }

      const tokenPayload = await tokenResponse.json()
      const clientSecret = tokenPayload.clientSecret?.value

      if (!clientSecret) {
        throw new Error('Missing client secret')
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      pcRef.current = pc

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      startAnalyser(stream)

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          cleanupConnection()
          setConnection('disconnected')
          setStatus('Idle')
        }
      }

      dc.onopen = () => {
        didSendInitialPromptRef.current = false
        sendSessionUpdate()
        setStatus('Listening')
      }

      dc.onmessage = async (event) => {
        let message: Record<string, any>
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }
        switch (message.type) {
          case 'session.created':
          case 'session.updated':
            if (!didSendInitialPromptRef.current) {
              didSendInitialPromptRef.current = true
              sendResponseCreate(initialPrompt || 'Start the first conceptual question.')
            }
            break
          case 'response.created':
            responseActiveRef.current = true
            setStatus('Thinking')
            break
          case 'response.done':
            responseActiveRef.current = false
            assistantSpeakingRef.current = false
            setStatus('Listening')
            if (pendingResponsePromptRef.current) {
              const queuedPrompt = pendingResponsePromptRef.current
              pendingResponsePromptRef.current = null
              sendResponseCreate(queuedPrompt)
            }
            if (metricsDirtyRef.current) {
              onMetrics?.(metricsRef.current)
              metricsDirtyRef.current = false
            }
            break
          case 'input_audio_buffer.speech_started':
            setMetrics({})
            lastSpeechStartRef.current = performance.now()
            firstTranscriptSeenRef.current = false
            awaitingAudioRef.current = true
            metricsDirtyRef.current = false
            setStatus('Listening')
            break
          case 'input_audio_buffer.speech_stopped':
            lastSpeechStopRef.current = performance.now()
            if (lastSpeechStartRef.current && lastSpeechStopRef.current) {
              const speechStart = lastSpeechStartRef.current
              const speechStop = lastSpeechStopRef.current
              setMetrics(prev => ({
                ...prev,
                speechMs: speechStop - speechStart,
              }))
              metricsDirtyRef.current = true
            }
            break
          case 'conversation.item.input_audio_transcription.delta':
            if (!firstTranscriptSeenRef.current && lastSpeechStartRef.current) {
              firstTranscriptSeenRef.current = true
              const ttft = performance.now() - lastSpeechStartRef.current
              setMetrics(prev => ({ ...prev, ttftMs: ttft }))
              metricsDirtyRef.current = true
            }
            setUserInterim((prev) => `${prev}${message.delta ?? ''}`)
            break
          case 'conversation.item.input_audio_transcription.completed':
            {
              const completedTranscript = message.transcript || message.text || userInterimRef.current
              setUserInterim('')
              appendConversation('user', completedTranscript || '')
              if (completedTranscript) {
                const detectedLanguage = detectLikelyLanguage(completedTranscript)
                setMetrics((prev) => ({
                  ...prev,
                  lastDetectedLanguage: detectedLanguage,
                }))
                metricsDirtyRef.current = true
                onDetectedLanguage?.(detectedLanguage, completedTranscript)
              }
            }
            break
          case 'response.output_audio_transcript.delta':
            setAssistantInterim((prev) => `${prev}${message.delta ?? ''}`)
            break
          case 'response.output_audio_transcript.done':
            {
              const completedAssistant = message.transcript || message.text || assistantInterimRef.current
              setAssistantInterim('')
              appendConversation('assistant', completedAssistant || '')
            }
            break
          case 'output_audio_buffer.started':
            assistantSpeakingRef.current = true
            if (awaitingAudioRef.current && lastSpeechStopRef.current) {
              const ttfa = performance.now() - lastSpeechStopRef.current
              setMetrics(prev => ({ ...prev, ttfaMs: ttfa }))
              awaitingAudioRef.current = false
              metricsDirtyRef.current = true
            }
            assistantAudioStartRef.current = performance.now()
            setStatus('Speaking')
            break
          case 'response.output_audio.done':
            assistantSpeakingRef.current = false
            if (assistantAudioStartRef.current) {
              const startedAt = assistantAudioStartRef.current
              setMetrics(prev => ({
                ...prev,
                responseMs: performance.now() - startedAt,
              }))
              metricsDirtyRef.current = true
            }
            break
          case 'response.output_item.added':
            if (message.item?.role === 'assistant') {
              lastAssistantItemIdRef.current = message.item.id
            }
            break
          case 'conversation.item.added':
            if (message.item?.role === 'assistant') {
              lastAssistantItemIdRef.current = message.item.id
            }
            break
          case 'response.function_call_arguments.done':
            await handleToolCall(message)
            break
          case 'error':
            {
              const errorMessage =
                message.error?.message ||
                message.message ||
                'Realtime session error'
              const normalized = String(errorMessage).toLowerCase()
              const ignorable =
                normalized.includes('no active response found') ||
                normalized.includes('active response in progress')
              if (!ignorable) {
                setError(errorMessage)
              }
            }
            break
          default:
            break
        }
      }

      pc.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0]
          audioRef.current.play().catch(() => null)
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text())
      }

      const answerSdp = await sdpResponse.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

      setConnection('connected')
    } catch (err: any) {
      cleanupConnection()
      setError(err?.message || 'Failed to connect')
      setConnection('disconnected')
      setStatus('Idle')
    }
  }, [
    appendConversation,
    cleanupConnection,
    connection,
    audioRef,
    handleToolCall,
    onMetrics,
    sendResponseCreate,
    initialPrompt,
    resetMetrics,
    sendSessionUpdate,
    sessionId,
    startAnalyser,
    onDetectedLanguage,
  ])

  const disconnect = useCallback(() => {
    cleanupConnection()
    pendingResponsePromptRef.current = null

    setConnection('disconnected')
    setStatus('Idle')
    setError(null)
    setUserInterim('')
    setAssistantInterim('')
    resetMetrics()
  }, [cleanupConnection, resetMetrics])

  useEffect(() => () => disconnect(), [disconnect])

  useEffect(() => {
    if (connection === 'connected') {
      sendSessionUpdate()
    }
  }, [connection, language, languageMode, sendSessionUpdate, toolSpec, instructions])

  return {
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
  }
}
