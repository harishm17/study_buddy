import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMasteryFromSignals, intervalFromMastery } from './mastery-math'

const none = { quizScores: [], voiceScores: [], examScores: [] }

test('a quiz-only student with 100% reaches full mastery', () => {
  const result = computeMasteryFromSignals({ ...none, quizScores: [100], daysSinceLastPractice: 0 })
  assert.equal(result.mastery, 1)
})

test('a quiz-only student reaches the 7-day review interval at 70%', () => {
  const result = computeMasteryFromSignals({ ...none, quizScores: [70, 70], daysSinceLastPractice: 0 })
  assert.ok(Math.abs(result.mastery - 0.7) < 1e-9)
  assert.equal(intervalFromMastery(result.mastery), 7)
})

test('a voice-only student is scored on voice alone', () => {
  const result = computeMasteryFromSignals({ ...none, voiceScores: [0.8], daysSinceLastPractice: 0 })
  assert.ok(Math.abs(result.mastery - 0.8) < 1e-9)
})

test('weights are renormalised over the sources present', () => {
  // quiz 0.55 and exam 0.2 are present: (0.55 * 1 + 0.2 * 0.5) / 0.75
  const result = computeMasteryFromSignals({
    ...none,
    quizScores: [100],
    examScores: [0.5],
    daysSinceLastPractice: 0,
  })
  assert.ok(Math.abs(result.mastery - 0.65 / 0.75) < 1e-9)
})

test('all three sources use the original 55/25/20 split', () => {
  const result = computeMasteryFromSignals({
    quizScores: [100],
    voiceScores: [0],
    examScores: [1],
    daysSinceLastPractice: 0,
  })
  assert.ok(Math.abs(result.mastery - 0.75) < 1e-9)
})

test('no data at all is zero mastery', () => {
  const result = computeMasteryFromSignals({ ...none, daysSinceLastPractice: 30 })
  assert.equal(result.mastery, 0)
})

test('the recency penalty still applies, capped at 0.25', () => {
  const fresh = computeMasteryFromSignals({ ...none, quizScores: [100], daysSinceLastPractice: 0 })
  const stale = computeMasteryFromSignals({ ...none, quizScores: [100], daysSinceLastPractice: 60 })
  assert.equal(fresh.mastery, 1)
  assert.ok(Math.abs(stale.mastery - 0.75) < 1e-9)
})

test('scores outside the range are clamped', () => {
  const result = computeMasteryFromSignals({ ...none, quizScores: [250], daysSinceLastPractice: 0 })
  assert.equal(result.mastery, 1)
})

import { masteryFromHistory, newestPerTopic } from './mastery-math'

test('newestPerTopic keeps the first rows of each topic and skips rows with no topic', () => {
  const rows = [
    { topicId: 'a', n: 1 },
    { topicId: 'b', n: 2 },
    { topicId: null, n: 3 },
    { topicId: 'a', n: 4 },
    { topicId: 'a', n: 5 },
  ]
  const grouped = newestPerTopic(rows, 2)
  assert.deepEqual(grouped.get('a')?.map((row) => row.n), [1, 4])
  assert.deepEqual(grouped.get('b')?.map((row) => row.n), [2])
  assert.equal(grouped.size, 2)
})

test('masteryFromHistory matches computeMasteryFromSignals on the same results', () => {
  const now = Date.parse('2026-10-21T00:00:00Z')
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000)
  const result = masteryFromHistory({
    quiz: [{ score: 80, at: daysAgo(2) }, { score: 60, at: daysAgo(6) }],
    voice: [{ score: 0.5, at: daysAgo(4) }],
    exam: [],
    now,
  })
  const expected = computeMasteryFromSignals({
    quizScores: [80, 60],
    voiceScores: [0.5],
    examScores: [],
    daysSinceLastPractice: 2,
  })
  assert.deepEqual(result, expected)
})

test('masteryFromHistory treats a topic with no results as 30 days idle', () => {
  const result = masteryFromHistory({ quiz: [], voice: [], exam: [], now: Date.now() })
  assert.equal(result.mastery, 0)
  assert.ok(Math.abs(result.recencyPenalty - 0.25) < 1e-9)
})
