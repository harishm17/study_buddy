import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyMinutesSchema, examDateColumn, examDateSchema, minutesLabel } from './plan-settings'
import { scoresByTopic } from './exam-mastery'

test('an exam date is a real calendar date or null', () => {
  assert.equal(examDateSchema.safeParse('2026-12-14').success, true)
  assert.equal(examDateSchema.safeParse(null).success, true)
  assert.equal(examDateSchema.safeParse('2026-02-30').success, false)
  assert.equal(examDateSchema.safeParse('14/12/2026').success, false)
  assert.equal(examDateSchema.safeParse('').success, false)
  assert.equal(examDateSchema.safeParse(20261214).success, false)
})

test('the exam date is stored as midnight UTC of that date; null clears it and undefined leaves it', () => {
  assert.equal(examDateColumn('2026-12-14')?.toISOString(), '2026-12-14T00:00:00.000Z')
  assert.equal(examDateColumn(null), null)
  assert.equal(examDateColumn(undefined), undefined)
})

test('daily minutes are whole numbers between 10 and 600', () => {
  for (const ok of [10, 45, 90, 600]) assert.equal(dailyMinutesSchema.safeParse(ok).success, true, String(ok))
  for (const bad of [9, 601, 45.5, '45', null]) assert.equal(dailyMinutesSchema.safeParse(bad).success, false, String(bad))
})

test('minutes read plainly', () => {
  assert.equal(minutesLabel(20), '20 minutes')
  assert.equal(minutesLabel(45), '45 minutes')
  assert.equal(minutesLabel(60), '1 hour')
  assert.equal(minutesLabel(90), '1 hour 30 minutes')
  assert.equal(minutesLabel(120), '2 hours')
})

test('an exam submission scores each topic as the mean of its questions, skipping questions with no topic', () => {
  const scores = scoresByTopic([
    { topicId: 'a', score: 1 },
    { topicId: 'a', score: 0.5 },
    { topicId: 'b', score: 0 },
    { topicId: null, score: 1 },
  ])
  assert.equal(scores.get('a'), 0.75)
  assert.equal(scores.get('b'), 0)
  assert.equal(scores.size, 2)
  assert.equal(scoresByTopic([]).size, 0)
})
