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
