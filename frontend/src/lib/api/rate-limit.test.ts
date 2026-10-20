import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from './rate-limit'

test('allows up to the limit, then refuses with a retry time', () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 })
  assert.equal(limiter.check('a', 0).ok, true)
  assert.equal(limiter.check('a', 1000).ok, true)
  assert.equal(limiter.check('a', 2000).ok, true)
  const refused = limiter.check('a', 3000)
  assert.equal(refused.ok, false)
  assert.equal(refused.retryAfterSeconds, 57)
})

test('keys are counted separately', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  assert.equal(limiter.check('a', 0).ok, true)
  assert.equal(limiter.check('b', 0).ok, true)
  assert.equal(limiter.check('a', 1).ok, false)
})

test('hits expire after the window', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  assert.equal(limiter.check('a', 0).ok, true)
  assert.equal(limiter.check('a', 59_999).ok, false)
  assert.equal(limiter.check('a', 60_001).ok, true)
})

test('refused attempts do not extend the lockout', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  limiter.check('a', 0)
  limiter.check('a', 30_000)
  assert.equal(limiter.check('a', 60_001).ok, true)
})
