import test from 'node:test'
import assert from 'node:assert/strict'
import { describeNextAction } from './next-action'
import type { NextAction } from '@/lib/learning/planner'

const action = (over: Partial<NextAction>): NextAction => ({
  id: 'x',
  type: 'study_topic',
  topicId: 't1',
  title: 'Study next topic: Graph traversal',
  reason: '',
  priority: 2,
  etaMinutes: 18,
  ...over,
})

test('the first topic says Start and goes to its notes', () => {
  const described = describeNextAction(action({}), 'c1', 'Graph traversal')
  assert.equal(described.title, 'Start Graph traversal')
  assert.equal(described.href, '/courses/c1/topics/t1?view=notes')
  assert.equal(described.verb, 'Start')
  assert.equal(described.etaLabel, 'About 18 min')
  assert.doesNotMatch(`${described.title} ${described.reason}`, /generate|build|\$/i)
})

test('a topic that has been started says Continue', () => {
  const described = describeNextAction(action({ started: true }), 'c1', 'Graph traversal')
  assert.equal(described.title, 'Continue Graph traversal')
  assert.equal(described.verb, 'Continue')
})

test('review and quiz go to the quiz view', () => {
  assert.equal(describeNextAction(action({ type: 'review_topic' }), 'c1', 'Hashing').href, '/courses/c1/topics/t1?view=quiz')
  assert.equal(describeNextAction(action({ type: 'take_quiz' }), 'c1', 'Hashing').title, 'Take the Hashing quiz')
})

test('a batch review says how many are due', () => {
  const described = describeNextAction(
    action({ type: 'review_topic', id: 'c1-review-batch', title: 'Review 3 due topics' }),
    'c1',
    'Hashing'
  )
  assert.equal(described.reason, '3 topics are due for review.')
})

test('content being written is a notice, not an action to start', () => {
  const active = describeNextAction(action({ type: 'generate_content', id: 'c1-generate-batch-active', topicId: null }), 'c1')
  assert.equal(active.isGenerating, true)
  assert.equal(active.href, '/courses/c1')
  assert.equal('isBatchGenerate' in active, false)
})

test('setup actions route to materials and the topic editor', () => {
  assert.equal(describeNextAction(action({ type: 'upload_materials', topicId: null }), 'c1').href, '/courses/c1/materials')
  assert.equal(describeNextAction(action({ type: 'confirm_topics', topicId: null }), 'c1').href, '/courses/c1/topics?edit=1')
})

test('exam actions', () => {
  assert.equal(describeNextAction(action({ type: 'take_exam', id: 'c1-exam-build', topicId: null }), 'c1').href, '/courses/c1/exams/new')
  assert.equal(describeNextAction(action({ type: 'take_exam', id: 'c1-exam', topicId: null }), 'c1').href, '/courses/c1/exams')
})
