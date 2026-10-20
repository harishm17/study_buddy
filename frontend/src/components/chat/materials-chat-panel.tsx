'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AlertCircle, Loader2, MessageSquare, Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { chatErrorMessage } from '@/lib/chat/errors'
import { exampleQuestions } from '@/lib/chat/examples'
import {
  applyChatEvent,
  createLineSplitter,
  INITIAL_ANSWER,
  parseChatEvent,
  type AnswerState,
} from '@/lib/chat/events'
import { parseStoredCitations, type StoredCitations } from '@/lib/chat/citations'
import { cn } from '@/lib/utils'
import { AnswerView } from './answer-view'

const MAX_QUESTION_CHARS = 2000

type Thread = { id: string; title: string | null; updatedAt: string }

type Turn = {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  citations?: StoredCitations
}

type Live = { question: string; answer: AnswerState }

export type MaterialsChatProps = {
  projectId: string
  topics: { id: string; name: string }[]
  /** At least one material has finished processing. */
  hasMaterials: boolean
  initialTopicId?: string | null
  onGoToMaterials?: () => void
}

async function errorFromResponse(response: Response): Promise<AnswerState['error']> {
  let code = ''
  try {
    const body = await response.json()
    code = body?.error?.details?.code ?? ''
  } catch {
    // Not JSON.
  }
  if (!code) {
    if (response.status === 401) return { code: 'UNAUTHORIZED', message: 'Your session has ended. Sign in again.', retryable: false }
    if (response.status === 429) code = 'RATE_LIMITED'
    else code = response.status >= 500 ? 'CHAT_UNAVAILABLE' : 'CHAT_FAILED'
  }
  const info = chatErrorMessage(code)
  return { code, message: info.message, retryable: info.retryable }
}

export default function MaterialsChatPanel({
  projectId,
  topics,
  hasMaterials,
  initialTopicId = null,
  onGoToMaterials,
}: MaterialsChatProps) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [live, setLive] = useState<Live | null>(null)
  const [input, setInput] = useState('')
  const [topicId, setTopicId] = useState<string>(initialTopicId ?? '')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const failedTurnId = useRef<string | null>(null)
  const mounted = useRef(true)
  const abortRef = useRef<AbortController | null>(null)

  const examples = useMemo(() => exampleQuestions(topics.map((t) => t.name)), [topics])
  const chatBase = `/api/projects/${projectId}/chat`

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`${chatBase}/threads`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.threads) setThreads(data.threads)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [chatBase])

  // Follow the answer as it grows, unless the student has scrolled up to read.
  useEffect(() => {
    const element = scrollRef.current
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight
  }, [turns, live?.answer.text, live?.answer.status])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
  }

  const startNewChat = () => {
    if (busy) return
    setActiveThreadId(null)
    setTurns([])
    setLive(null)
    setNotice(null)
    failedTurnId.current = null
    textareaRef.current?.focus()
  }

  const openThread = async (threadId: string) => {
    if (busy || threadId === activeThreadId) return
    setLoadingThread(true)
    setNotice(null)
    setLive(null)
    failedTurnId.current = null
    try {
      const response = await fetch(`${chatBase}/threads/${threadId}`)
      if (!response.ok) throw new Error('load failed')
      const data = await response.json()
      setActiveThreadId(threadId)
      setTurns(
        (data.messages as { id: string; role: Turn['role']; content: string; citations: unknown }[]).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: m.role === 'assistant' ? parseStoredCitations(m.citations) : undefined,
        }))
      )
      stickToBottom.current = true
    } catch {
      setNotice('Could not open that conversation. Try again.')
    } finally {
      setLoadingThread(false)
    }
  }

  const deleteThread = async (threadId: string) => {
    const response = await fetch(`${chatBase}/threads/${threadId}`, { method: 'DELETE' })
    if (!response.ok) {
      setNotice('Could not delete that conversation. Try again.')
      return
    }
    setThreads((list) => list.filter((t) => t.id !== threadId))
    if (threadId === activeThreadId) startNewChat()
  }

  const ask = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim()
      if (!question || busy) return

      setNotice(null)
      const localId = `local-${Date.now()}`
      let userTurnId = localId
      const dropped = failedTurnId.current
      failedTurnId.current = null
      setTurns((list) => [...list.filter((t) => t.id !== dropped), { id: localId, role: 'user', content: question }])
      let answer: AnswerState = INITIAL_ANSWER
      setLive({ question, answer })
      setInput('')
      setBusy(true)
      stickToBottom.current = true

      const controller = new AbortController()
      abortRef.current = controller
      let doneSeen = false
      let threadId = activeThreadId

      const show = (next: AnswerState) => {
        answer = next
        if (mounted.current) setLive({ question, answer: next })
      }

      try {
        const response = await fetch(chatBase, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            threadId: activeThreadId ?? undefined,
            topicId: topicId || undefined,
          }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          show({ ...INITIAL_ANSWER, status: 'error', error: await errorFromResponse(response) })
          failedTurnId.current = userTurnId
          return
        }

        const reader = response.body.getReader()
        const splitter = createLineSplitter()
        const handle = (line: string) => {
          const event = parseChatEvent(line)
          if (!event || !mounted.current) return
          if (event.type === 'thread') {
            threadId = event.threadId
            setActiveThreadId(event.threadId)
            if (event.isNew) {
              setThreads((list) => [
                { id: event.threadId, title: event.title, updatedAt: new Date().toISOString() },
                ...list.filter((t) => t.id !== event.threadId),
              ])
            }
            return
          }
          if (event.type === 'user_message') {
            const realId = event.id
            setTurns((list) => list.map((t) => (t.id === userTurnId ? { ...t, id: realId } : t)))
            userTurnId = realId
            return
          }
          if (event.type === 'done') doneSeen = true
          if (event.type === 'error' && doneSeen) {
            // The answer was shown but could not be saved.
            setNotice(chatErrorMessage(event.code).message)
            return
          }
          show(applyChatEvent(answer, event))
        }

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          for (const line of splitter.push(value)) handle(line)
        }
        for (const line of splitter.flush()) handle(line)

        if (!doneSeen && answer.status !== 'error') {
          const info = chatErrorMessage('CHAT_INTERRUPTED')
          show({ ...answer, status: 'error', error: { code: 'CHAT_INTERRUPTED', message: info.message, retryable: true } })
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return
        const info = chatErrorMessage('CHAT_UNAVAILABLE')
        show({ ...answer, status: 'error', error: { code: 'CHAT_UNAVAILABLE', message: info.message, retryable: true } })
      } finally {
        if (mounted.current) {
          setBusy(false)
          if (doneSeen && answer.status === 'done') {
            const finished = answer
            setTurns((list) => [
              ...list,
              {
                id: finished.messageId ?? `local-answer-${Date.now()}`,
                role: 'assistant',
                content: finished.text,
                citations: { sources: finished.sources, marks: finished.marks },
              },
            ])
            setLive(null)
            if (threadId) {
              setThreads((list) => {
                const current = list.find((t) => t.id === threadId)
                return current
                  ? [{ ...current, updatedAt: new Date().toISOString() }, ...list.filter((t) => t.id !== threadId)]
                  : list
              })
            }
          } else if (answer.status === 'error') {
            failedTurnId.current = userTurnId
          }
          textareaRef.current?.focus()
        }
      }
    },
    [activeThreadId, busy, chatBase, topicId]
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void ask(input)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void ask(input)
    }
  }

  const empty = turns.length === 0 && !live
  const overLimit = input.length > MAX_QUESTION_CHARS

  return (
    <section aria-label="Ask your materials" className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Conversations" className="space-y-2">
        <Button type="button" variant="outline" className="w-full justify-start" onClick={startNewChat} disabled={busy}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New chat
        </Button>
        {threads.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">Your conversations show up here.</p>
        ) : (
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId
              return (
                <li key={thread.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void openThread(thread.id)}
                    aria-current={active ? 'true' : undefined}
                    disabled={busy}
                    className={cn(
                      'min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-white/80'
                    )}
                  >
                    {thread.title || 'New chat'}
                  </button>
                  <ConfirmDialog
                    title="Delete this conversation?"
                    description="The conversation and its answers are removed. Your materials are not affected."
                    confirmLabel="Delete"
                    variant="destructive"
                    disabled={busy}
                    onConfirm={() => deleteThread(thread.id)}
                    trigger={
                      <button
                        type="button"
                        aria-label={`Delete conversation: ${thread.title || 'New chat'}`}
                        className="rounded-lg p-2 text-muted-foreground opacity-0 transition hover:bg-white/80 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <Card className="flex min-h-[28rem] flex-col p-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6"
          style={{ maxHeight: '36rem' }}
          aria-label="Conversation"
          tabIndex={0}
        >
          {loadingThread && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Opening conversation...
            </p>
          )}

          {empty && !loadingThread && (
            <div className="mx-auto max-w-xl py-6 text-center">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-xl font-semibold">Ask your materials</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Questions are answered only from the files you uploaded, with links to the page each answer came from.
              </p>
              {hasMaterials ? (
                <ul className="mt-5 space-y-2" aria-label="Example questions">
                  {examples.map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        onClick={() => void ask(example)}
                        disabled={busy}
                        className="w-full rounded-xl border border-border/80 bg-white/70 px-4 py-2.5 text-left text-sm transition hover:border-primary/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed p-4 text-sm">
                  <p>No material has finished processing yet. Upload a file and wait until it is marked valid.</p>
                  {onGoToMaterials && (
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onGoToMaterials}>
                      Go to materials
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {turns.map((turn) =>
            turn.role === 'user' ? (
              <div key={turn.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  {turn.content}
                </p>
              </div>
            ) : turn.role === 'error' ? (
              <p key={turn.id} className="text-sm text-muted-foreground">
                {turn.content}
              </p>
            ) : (
              <article key={turn.id} className="max-w-full" aria-label="Answer">
                <AnswerView
                  text={turn.content}
                  marks={turn.citations?.marks ?? []}
                  sources={turn.citations?.sources ?? []}
                />
              </article>
            )
          )}

          {live && (
            <article
              className="max-w-full"
              aria-label="Answer"
              aria-live="polite"
              aria-busy={live.answer.status === 'searching' || live.answer.status === 'writing'}
            >
              {live.answer.status === 'searching' && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Searching your materials...
                </p>
              )}
              {live.answer.text && (
                <AnswerView
                  text={live.answer.text}
                  marks={live.answer.marks}
                  sources={live.answer.sources}
                  showSources={live.answer.status !== 'writing'}
                />
              )}
              {live.answer.status === 'writing' && (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Writing...
                </p>
              )}
              {live.answer.status === 'error' && live.answer.error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                    <span>{live.answer.error.message}</span>
                    {live.answer.error.retryable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void ask(live.question)}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Try again
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </article>
          )}
        </div>

        <div className="border-t p-3 md:p-4">
          {notice && (
            <Alert variant="destructive" className="mb-3" role="status">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <label htmlFor="chat-topic" className="font-medium">
                Focus on
              </label>
              <select
                id="chat-topic"
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
                disabled={busy}
                className="max-w-[16rem] truncate rounded-lg border border-input/80 bg-white/80 px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All materials</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="chat-question" className="sr-only">
                  Your question
                </label>
                <textarea
                  id="chat-question"
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onKeyDown}
                  rows={2}
                  placeholder={hasMaterials ? 'Ask a question about your materials' : 'Upload a material first'}
                  disabled={!hasMaterials}
                  aria-describedby="chat-question-help"
                  aria-invalid={overLimit}
                  className="w-full resize-none rounded-xl border border-input/80 bg-white/80 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <Button type="submit" disabled={busy || !hasMaterials || !input.trim() || overLimit} className="h-11">
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Ask
              </Button>
            </div>
            <p id="chat-question-help" className={cn('text-xs', overLimit ? 'text-destructive' : 'text-muted-foreground')}>
              {overLimit
                ? `Questions can be up to ${MAX_QUESTION_CHARS} characters (${input.length} now).`
                : 'Enter to send, Shift+Enter for a new line. Answers come only from your files and can still be wrong, so check the sources.'}
            </p>
          </form>
        </div>
      </Card>
    </section>
  )
}
