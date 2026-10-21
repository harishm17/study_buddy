import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAnswer, formatKey, reviewState } from './quiz-format'

const mc = {
  question_type: 'multiple_choice' as const,
  question_text: 'Q',
  points: 2,
  options: [
    { id: 'A', text: 'O(V)' },
    { id: 'B', text: 'O(V + E)' },
  ],
}

test('multiple choice answers show the option text', () => {
  assert.equal(formatAnswer(mc, 'B'), 'B. O(V + E)')
  assert.equal(formatAnswer(mc, 'z'), 'z')
  assert.equal(formatKey(mc, 'A'), 'A. O(V)')
})

test('true or false, numerical and empty answers', () => {
  assert.equal(formatAnswer({ question_type: 'true_false', question_text: 'Q', points: 1 }, 'TRUE'), 'True')
  assert.equal(formatAnswer({ question_type: 'numerical', question_text: 'Q', points: 1, unit: 'm/s' }, '9.8'), '9.8 m/s')
  assert.equal(formatAnswer(mc, undefined), '')
})

test('review state from points', () => {
  assert.equal(reviewState({ isCorrect: true, pointsEarned: 2 }), 'correct')
  assert.equal(reviewState({ isCorrect: false, pointsEarned: 1 }), 'partial')
  assert.equal(reviewState({ isCorrect: false, pointsEarned: 0 }), 'wrong')
})
