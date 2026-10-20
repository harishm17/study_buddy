/**
 * One voice turn: the student's words go to the model, the model may ask for tools, the
 * server runs them and calls the model again, until it has said what it has to say.
 *
 * No network or database in here: the model and the tools are passed in, so the loop can be
 * tested with fakes. It reports to the browser through `emit` (text, question, evaluation,
 * hint, session_complete and error events). The final `done` event is the caller's to send,
 * once it has stored the conversation.
 */
import type { ModelEvent } from '@/lib/voice/ai-turn'
import { VoiceModelError } from '@/lib/voice/ai-turn'
import { voiceErrorMessage } from '@/lib/voice/errors'
import type { VoiceBlock, VoiceMessage } from '@/lib/voice/history'
import type { VoiceToolResult } from '@/lib/voice/tools'
import type { VoiceEvent } from '@/lib/voice/turn-client'

/** Model calls in one turn: the reply, and up to three rounds of tool results. */
export const MAX_MODEL_CALLS = 4

export type TurnDeps = {
  /** Starts a model call for the conversation so far. Throws VoiceModelError when it is refused. */
  openModel(messages: VoiceMessage[], callNumber: number): Promise<AsyncIterable<ModelEvent>>
  runTool(name: string, input: Record<string, unknown>): Promise<VoiceToolResult>
  emit(event: VoiceEvent): void
  maxModelCalls?: number
  log?: (message: string, error?: unknown) => void
}

export type TurnOutcome = {
  /** The conversation up to the last complete step: tool results included, a failed call not. */
  messages: VoiceMessage[]
  /** Everything the coach said this turn. */
  text: string
  ok: boolean
  error: { code: string; retryable: boolean } | null
  /** At least one tool ran, so the conversation must be kept even though the turn failed. */
  toolsRan: boolean
  /** The drill finished during this turn. */
  sessionComplete: boolean
}

function textOf(content: VoiceBlock[]): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
}

export async function runTurn(deps: TurnDeps, start: VoiceMessage[]): Promise<TurnOutcome> {
  const log = deps.log ?? ((message, error) => console.error(`[VOICE] ${message}`, error ?? ''))
  const max = deps.maxModelCalls ?? MAX_MODEL_CALLS
  let messages = [...start]
  const spoken: string[] = []
  let toolsRan = false
  let sessionComplete = false

  const fail = (code: string, retryable?: boolean): TurnOutcome => {
    const info = voiceErrorMessage(code)
    deps.emit({ type: 'error', code, message: info.message, retryable: retryable ?? info.retryable })
    return {
      messages,
      text: spoken.join(' '),
      ok: false,
      error: { code, retryable: retryable ?? info.retryable },
      toolsRan,
      sessionComplete,
    }
  }

  async function runTools(toolCalls: VoiceBlock[]): Promise<VoiceBlock[]> {
    const results: VoiceBlock[] = []
    for (const block of toolCalls) {
      const name = String(block.name ?? '')
      const input = block.input && typeof block.input === 'object' ? (block.input as Record<string, unknown>) : {}
      let result: VoiceToolResult
      try {
        result = await deps.runTool(name, input)
      } catch (error) {
        log(`Tool ${name} failed`, error)
        result = { output: { error: 'The tool failed. Tell the student and carry on.' }, events: [], sessionComplete: false, isError: true }
      }
      toolsRan = true
      if (result.sessionComplete) sessionComplete = true
      for (const event of result.events) deps.emit(event)
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result.output),
        ...(result.isError ? { is_error: true } : {}),
      })
    }
    return results
  }

  for (let call = 1; call <= max; call += 1) {
    let events: AsyncIterable<ModelEvent>
    try {
      events = await deps.openModel(messages, call)
    } catch (error) {
      if (error instanceof VoiceModelError) {
        log(`The AI service refused call ${call}: ${error.code}: ${error.message}`)
        return fail(error.code, error.retryable)
      }
      log(`The AI service is not reachable (call ${call})`, error)
      return fail('VOICE_UNAVAILABLE')
    }

    let segment = ''
    let done: Extract<ModelEvent, { type: 'done' }> | null = null
    try {
      for await (const event of events) {
        if (event.type === 'text') {
          // Two spoken segments in one turn (before and after a tool) need a space between them.
          if (!segment && spoken.length > 0 && !/\s$/.test(spoken[spoken.length - 1])) {
            deps.emit({ type: 'text', delta: ' ' })
          }
          segment += event.delta
          deps.emit({ type: 'text', delta: event.delta })
        } else if (event.type === 'done') {
          done = event
        } else if (event.type === 'error') {
          log(`The AI service reported ${event.code}: ${event.message}`)
          if (segment.trim()) spoken.push(segment.trim())
          return fail(event.code, event.retryable)
        }
        // tool_use events are only a preview: the blocks in `done` are what counts.
      }
    } catch (error) {
      log(`The AI service stream broke (call ${call})`, error)
      if (segment.trim()) spoken.push(segment.trim())
      return fail('VOICE_INTERRUPTED')
    }
    if (!done) {
      if (segment.trim()) spoken.push(segment.trim())
      return fail('VOICE_INTERRUPTED')
    }
    if (segment.trim()) spoken.push(segment.trim())

    // A tool call cut off by max_tokens is incomplete: do not send it back.
    const wantsTools = done.stopReason === 'tool_use'
    const content = wantsTools ? done.content : done.content.filter((block) => block.type !== 'tool_use')
    messages = [...messages, { role: 'assistant', content: content.length > 0 ? content : [{ type: 'text', text: textOf(done.content) }] }]

    const toolCalls = wantsTools ? done.content.filter((block) => block.type === 'tool_use') : []
    if (toolCalls.length === 0 || call === max) {
      if (toolCalls.length > 0) {
        // Out of calls with tool requests still pending. Answer them so the stored
        // conversation stays valid, but do not ask the model to speak again this turn.
        const results = await runTools(toolCalls)
        messages = [...messages, { role: 'user', content: results }]
      }
      return { messages, text: spoken.join(' '), ok: true, error: null, toolsRan, sessionComplete }
    }

    const results = await runTools(toolCalls)
    messages = [...messages, { role: 'user', content: results }]
  }

  // Unreachable: the loop always returns on its last call.
  return fail('VOICE_TURN_FAILED')
}
