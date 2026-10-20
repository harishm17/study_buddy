import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, apiFetch, parseApiError } from './client'

const withFetch = async (response: () => Response | Promise<Response>, run: () => Promise<void>) => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => response()) as typeof fetch
  try {
    await run()
  } finally {
    globalThis.fetch = original
  }
}

test('shape A: a string error', () => {
  const error = parseApiError(409, { error: 'User with this email already exists' })
  assert.equal(error.message, 'User with this email already exists')
  assert.equal(error.code, 'CONFLICT')
  assert.equal(error.status, 409)
})

test('shape A keeps its details', () => {
  const error = parseApiError(400, { error: 'Invalid input', details: [{ path: 'name' }] })
  assert.deepEqual(error.details, [{ path: 'name' }])
})

test('shape B: a typed error', () => {
  const error = parseApiError(404, { error: { code: 'NOT_FOUND', message: 'Project not found' } })
  assert.equal(error.message, 'Project not found')
  assert.equal(error.code, 'NOT_FOUND')
})

test('shape C: a code in details wins over the typed code', () => {
  const error = parseApiError(409, {
    error: {
      code: 'CONFLICT',
      message: 'Time is up',
      details: { code: 'ATTEMPT_EXPIRED', submissionId: 's1' },
    },
  })
  assert.equal(error.code, 'ATTEMPT_EXPIRED')
  assert.deepEqual(error.details, { code: 'ATTEMPT_EXPIRED', submissionId: 's1' })
})

test('extra body fields stay reachable', () => {
  const error = parseApiError(502, { error: 'Submitted, but grading did not start', submissionId: 's9' })
  assert.equal((error.body as { submissionId: string }).submissionId, 's9')
})

test('no usable body falls back to a message that fits the status', () => {
  assert.match(parseApiError(500, undefined).message, /went wrong/)
  assert.match(parseApiError(401, null).message, /signed out/)
  assert.equal(parseApiError(429, {}).code, 'RATE_LIMITED')
  assert.equal(parseApiError(503, '<html>').code, 'UPSTREAM_ERROR')
})

test('Retry-After is read from the headers', () => {
  const error = parseApiError(429, { error: 'Slow down' }, new Headers({ 'retry-after': '30' }))
  assert.equal(error.retryAfterSeconds, 30)
  assert.equal(parseApiError(429, {}).retryAfterSeconds, null)
})

test('apiFetch returns parsed JSON and sends a JSON body', async () => {
  let seen: { body?: unknown; type?: string | null } = {}
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    seen = { body: init.body, type: new Headers(init.headers).get('content-type') }
    return new Response(JSON.stringify({ ok: 1 }), { status: 200 })
  }) as unknown as typeof fetch
  try {
    const result = await apiFetch<{ ok: number }>('/api/x', { method: 'POST', json: { a: 1 } })
    assert.deepEqual(result, { ok: 1 })
    assert.equal(seen.body, '{"a":1}')
    assert.equal(seen.type, 'application/json')
  } finally {
    globalThis.fetch = original
  }
})

test('apiFetch throws an ApiError for a failed response', async () => {
  await withFetch(
    () => new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Bad name' } }), { status: 400 }),
    async () => {
      await assert.rejects(apiFetch('/api/x'), (error: unknown) => {
        assert.ok(error instanceof ApiError)
        assert.equal(error.message, 'Bad name')
        assert.equal(error.status, 400)
        return true
      })
    }
  )
})

test('apiFetch turns a network failure into status 0', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch
  try {
    await assert.rejects(apiFetch('/api/x'), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 0)
      assert.equal(error.code, 'NETWORK')
      return true
    })
  } finally {
    globalThis.fetch = original
  }
})

test('apiFetch tolerates an empty success body', async () => {
  await withFetch(
    () => new Response(null, { status: 204 }),
    async () => {
      assert.equal(await apiFetch('/api/x', { method: 'DELETE' }), undefined)
    }
  )
})
