/**
 * Relays the AI service's answer stream to the browser while the server stores the result.
 *
 * The browser gets the AI service's events as they arrive (text, citations), with `thread`
 * and `user_message` events first and `saved` last. The relay keeps reading the AI service
 * even when the browser has gone away, so a closed tab still ends with the answer stored and
 * its cost recorded, instead of a paid answer nobody can find.
 */
import { createLineSplitter, parseChatEvent } from './events'
import { chatErrorMessage } from './errors'
import type { ChatSource, CitationMark } from './citations'

export type UsageInfo = { inputTokens: number; outputTokens: number; costUsd: number }

export type AnswerRecord = {
  text: string
  sources: ChatSource[]
  marks: CitationMark[]
  usage: UsageInfo
}

export type ChatStorage = {
  /** Store the assistant message; resolves to its id. */
  saveAnswer(record: AnswerRecord): Promise<string>
  /**
   * The answer failed. `usage` is set when the model was called and billed. The storage
   * keeps a note of the failure for a billed call, so the cost counts toward the daily
   * budget, and otherwise removes the question so the thread has no unanswered turn.
   */
  recordFailure(code: string, usage: UsageInfo | null): Promise<void>
}

export function parseUsage(value: unknown): UsageInfo | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  return {
    inputTokens: Math.round(number(raw.input_tokens)),
    outputTokens: Math.round(number(raw.output_tokens)),
    costUsd: number(raw.cost_usd),
  }
}

type Json = Record<string, unknown>

export function relayChatStream(args: {
  /** Events sent before the AI service's own (thread, user_message). */
  head: Json[]
  upstream: ReadableStream<Uint8Array>
  storage: ChatStorage
  log?: (message: string, error?: unknown) => void
}): ReadableStream<Uint8Array> {
  const { head, upstream, storage } = args
  const log = args.log ?? ((message, error) => console.error(`[CHAT] ${message}`, error ?? ''))
  const encoder = new TextEncoder()
  let clientGone = false

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: Json) => {
        if (clientGone) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          clientGone = true
        }
      }
      const sendError = (code: string) => {
        const info = chatErrorMessage(code)
        send({ type: 'error', code, message: info.message, retryable: info.retryable })
      }
      const safely = async (what: string, work: () => Promise<unknown>): Promise<boolean> => {
        try {
          await work()
          return true
        } catch (error) {
          log(`${what} failed`, error)
          return false
        }
      }

      void (async () => {
        let finished = false
        try {
          for (const event of head) send(event)

          const handle = async (line: string) => {
            const event = parseChatEvent(line)
            if (!event || finished) return
            let raw: Json = {}
            try {
              raw = JSON.parse(line) as Json
            } catch {
              return
            }

            if (event.type === 'done') {
              finished = true
              const usage = parseUsage(raw.usage) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
              // The browser sees the finished answer before the database write.
              send({ ...raw, usage: undefined })
              let messageId: string | null = null
              const saved = await safely('saving the answer', async () => {
                messageId = await storage.saveAnswer({
                  text: event.text,
                  sources: event.sources,
                  marks: event.marks,
                  usage,
                })
              })
              if (saved && messageId) send({ type: 'saved', messageId })
              else sendError('CHAT_NOT_SAVED')
            } else if (event.type === 'error') {
              finished = true
              const usage = parseUsage(raw.usage)
              // The AI service's message can carry internal detail; the browser gets ours.
              log(`AI service reported ${event.code}: ${event.message}`)
              await safely('recording the failure', () => storage.recordFailure(event.code, usage))
              sendError(event.code)
            } else {
              send({ ...raw, usage: undefined })
            }
          }

          const splitter = createLineSplitter()
          const reader = upstream.getReader()
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            for (const line of splitter.push(value)) await handle(line)
          }
          for (const line of splitter.flush()) await handle(line)

          if (!finished) {
            finished = true
            await safely('recording the failure', () => storage.recordFailure('CHAT_INTERRUPTED', null))
            sendError('CHAT_INTERRUPTED')
          }
        } catch (error) {
          log('the AI service stream broke', error)
          if (!finished) {
            finished = true
            await safely('recording the failure', () => storage.recordFailure('CHAT_INTERRUPTED', null))
            sendError('CHAT_INTERRUPTED')
          }
        } finally {
          try {
            controller.close()
          } catch {
            // Already closed because the browser went away.
          }
        }
      })()
    },
    cancel() {
      // The browser left. The loop above keeps going so the answer is still stored.
      clientGone = true
    },
  })
}
