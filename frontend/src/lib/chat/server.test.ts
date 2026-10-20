import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { errorCodeFromResponse, HISTORY_MESSAGES, titleFromQuestion, toHistoryTurns } from './server'

describe('titleFromQuestion', () => {
  it('keeps a short question and flattens whitespace', () => {
    assert.equal(titleFromQuestion('  What is\n hashing?  '), 'What is hashing?')
  })

  it('cuts a long question with an ellipsis', () => {
    const title = titleFromQuestion('word '.repeat(60))
    assert.ok(title.length <= 80)
    assert.ok(title.endsWith('…'))
  })
})

describe('toHistoryTurns', () => {
  it('keeps the last messages, oldest first, and skips failure notes and blanks', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }))
    messages.push({ role: 'error', content: 'The AI service is busy.' }, { role: 'user', content: '   ' })
    const turns = toHistoryTurns(messages)
    assert.equal(turns.length, HISTORY_MESSAGES)
    assert.deepEqual(turns.map((t) => t.content), ['m4', 'm5', 'm6', 'm7', 'm8', 'm9'])
  })
})

describe('errorCodeFromResponse', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

  it('uses the AI service error code', async () => {
    assert.equal(await errorCodeFromResponse(json(429, { error_code: 'LLM_DAILY_BUDGET', detail: 'x' })), 'LLM_DAILY_BUDGET')
  })

  it('falls back by status when there is no code', async () => {
    assert.equal(await errorCodeFromResponse(new Response('<html>', { status: 502 })), 'CHAT_UNAVAILABLE')
    assert.equal(await errorCodeFromResponse(json(401, { detail: 'Unauthorized' })), 'CHAT_UNAVAILABLE')
    assert.equal(await errorCodeFromResponse(json(422, { detail: [] })), 'CHAT_FAILED')
  })
})
