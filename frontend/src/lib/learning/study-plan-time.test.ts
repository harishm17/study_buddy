import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidTimeZone, planStartTime } from './study-plan-time'

const startIso = (date: string | undefined, timeZone: string, now?: string) =>
  planStartTime({ date, timeZone, now: now ? new Date(now) : undefined })?.toISOString()

test('9 am in Chicago in October is 14:00 UTC (daylight time)', () => {
  assert.equal(startIso('2026-10-21', 'America/Chicago'), '2026-10-21T14:00:00.000Z')
})

test('9 am in Chicago after daylight time ends is 15:00 UTC', () => {
  assert.equal(startIso('2026-11-02', 'America/Chicago'), '2026-11-02T15:00:00.000Z')
  // The day the clocks change: 9 am is already standard time.
  assert.equal(startIso('2026-11-01', 'America/Chicago'), '2026-11-01T15:00:00.000Z')
})

test('zones ahead of UTC and with half-hour offsets', () => {
  assert.equal(startIso('2026-10-21', 'Asia/Kolkata'), '2026-10-21T03:30:00.000Z')
  assert.equal(startIso('2026-10-21', 'Asia/Tokyo'), '2026-10-21T00:00:00.000Z')
  assert.equal(startIso('2026-10-21', 'UTC'), '2026-10-21T09:00:00.000Z')
})

test('without a date it uses today in the student zone, not in UTC', () => {
  // 03:00 UTC on the 22nd is still the evening of the 21st in Chicago.
  assert.equal(startIso(undefined, 'America/Chicago', '2026-10-22T03:00:00Z'), '2026-10-21T14:00:00.000Z')
  // and already the 22nd in Tokyo.
  assert.equal(startIso(undefined, 'Asia/Tokyo', '2026-10-22T03:00:00Z'), '2026-10-22T00:00:00.000Z')
})

test('a malformed or impossible date gives null', () => {
  assert.equal(planStartTime({ date: '2026-13-01', timeZone: 'UTC' }), null)
  assert.equal(planStartTime({ date: '2026-02-30', timeZone: 'UTC' }), null)
  assert.equal(planStartTime({ date: 'tomorrow', timeZone: 'UTC' }), null)
})

test('time zone names are validated', () => {
  assert.equal(isValidTimeZone('America/Chicago'), true)
  assert.equal(isValidTimeZone('Mars/Olympus'), false)
  assert.equal(isValidTimeZone(''), false)
})
