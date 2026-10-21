/**
 * The coach conversation as Anthropic messages, kept on the voice session.
 *
 * Pure helpers: parse what is stored, add the student's words, and keep the last few
 * messages without breaking the pairing of tool calls and tool results.
 */

export type VoiceBlock = { type: string; [key: string]: unknown }
export type VoiceMessage = { role: 'user' | 'assistant'; content: string | VoiceBlock[] }

/** Messages kept on the session (about 15 exchanges). */
export const MAX_HISTORY_MESSAGES = 30

function isBlock(value: unknown): value is VoiceBlock {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

/** The stored history, or [] when it is missing or malformed. Bad messages are dropped. */
export function parseHistory(value: unknown): VoiceMessage[] {
  if (!Array.isArray(value)) return []
  const messages: VoiceMessage[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const { role, content } = entry as { role?: unknown; content?: unknown }
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof content === 'string') {
      if (content.trim()) messages.push({ role, content })
    } else if (Array.isArray(content)) {
      const blocks = content.filter(isBlock)
      if (blocks.length > 0) messages.push({ role, content: blocks })
    }
  }
  return messages
}

function blocksOf(message: VoiceMessage): VoiceBlock[] {
  return typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
}

/**
 * `messages` plus the student's words. When the last message is already from the user (a
 * turn that failed after its tool results were stored), the words join that message, because
 * the tool results must stay at the start of it.
 */
export function appendUserText(messages: readonly VoiceMessage[], text: string): VoiceMessage[] {
  const last = messages[messages.length - 1]
  if (last && last.role === 'user') {
    return [...messages.slice(0, -1), { role: 'user', content: [...blocksOf(last), { type: 'text', text }] }]
  }
  return [...messages, { role: 'user', content: text }]
}

/** True for a user message that answers a tool call. */
function hasToolResult(message: VoiceMessage): boolean {
  return message.role === 'user' && typeof message.content !== 'string' && message.content.some((b) => b.type === 'tool_result')
}

/**
 * The last `max` messages, starting at a user message that is not a tool result, so no tool
 * result is left without the tool call it answers and the conversation starts with the user.
 * When there is no such message in range the history is cut back to the latest one that is.
 */
export function trimHistory(messages: readonly VoiceMessage[], max = MAX_HISTORY_MESSAGES): VoiceMessage[] {
  let start = Math.max(0, messages.length - max)
  while (start < messages.length && (messages[start].role !== 'user' || hasToolResult(messages[start]))) start += 1
  return messages.slice(start)
}

/**
 * The messages as they are stored: thinking blocks are left out (a thinking block is only
 * valid in the conversation that produced it, and a trimmed history is a different one).
 * A message left with no content is dropped.
 */
export function toStoredHistory(messages: readonly VoiceMessage[], max = MAX_HISTORY_MESSAGES): VoiceMessage[] {
  const cleaned: VoiceMessage[] = []
  for (const message of messages) {
    if (typeof message.content === 'string') {
      cleaned.push(message)
      continue
    }
    const blocks = message.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking')
    if (blocks.length > 0) cleaned.push({ role: message.role, content: blocks })
  }
  return trimHistory(cleaned, max)
}
