import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveSetup } from './course-setup'

const base = { status: 'active', materialCount: 2, topicCount: 5, confirmedTopicCount: 5, contentBlockCount: 8 }

test('no materials is step 1', () => {
  const setup = deriveSetup({ ...base, status: 'setup', materialCount: 0, topicCount: 0, confirmedTopicCount: 0, contentBlockCount: 0 })
  assert.deepEqual(setup, { mode: 'setup', step: 1, label: 'Upload materials' })
})

test('materials but no topics yet is step 2, finding topics', () => {
  const setup = deriveSetup({ ...base, status: 'setup', topicCount: 0, confirmedTopicCount: 0, contentBlockCount: 0 })
  assert.deepEqual(setup, { mode: 'setup', step: 2, label: 'Finding topics' })
})

test('unconfirmed topics are step 2, review', () => {
  assert.equal(deriveSetup({ ...base, status: 'topics_pending', confirmedTopicCount: 0, contentBlockCount: 0 }).label, 'Review topics')
  assert.equal(deriveSetup({ ...base, confirmedTopicCount: 3 }).step, 2)
})

test('confirmed topics without content is step 3', () => {
  assert.deepEqual(deriveSetup({ ...base, contentBlockCount: 0 }), { mode: 'setup', step: 3, label: 'Build study content' })
})

test('confirmed topics with some content is active', () => {
  assert.deepEqual(deriveSetup(base), { mode: 'active', step: null, label: null })
  assert.equal(deriveSetup({ ...base, status: 'completed' }).mode, 'active')
})
