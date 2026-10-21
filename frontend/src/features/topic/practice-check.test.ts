import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPracticeAnswer, parseNumber, splitChoices, withinTolerance } from './practice-check'

const numeric = { answerType: 'numeric' as const, correctAnswer: '4', acceptableAnswers: ['four'] }
const text = { answerType: 'text' as const, correctAnswer: 'Breadth-first search', acceptableAnswers: ['BFS'] }

test('trims and ignores case', () => {
  assert.equal(checkPracticeAnswer(text, '  breadth-first SEARCH '), true)
  assert.equal(checkPracticeAnswer(text, 'bfs'), true)
  assert.equal(checkPracticeAnswer(text, 'dfs'), false)
  assert.equal(checkPracticeAnswer(text, '   '), false)
})

test('accepts an acceptable answer even for a numeric step', () => {
  assert.equal(checkPracticeAnswer(numeric, 'Four'), true)
})

test('numeric steps allow 1% relative tolerance', () => {
  const step = { answerType: 'numeric' as const, correctAnswer: '1250', acceptableAnswers: [] }
  assert.equal(checkPracticeAnswer(step, '1250'), true)
  assert.equal(checkPracticeAnswer(step, '1,260'), true)
  assert.equal(checkPracticeAnswer(step, '1263'), false)
  assert.equal(checkPracticeAnswer(numeric, '4.03'), true)
  assert.equal(checkPracticeAnswer(numeric, '4.1'), false)
})

test('numeric answers tolerate units, fractions and zero', () => {
  assert.equal(checkPracticeAnswer({ ...numeric, correctAnswer: '9.8' }, '9.8 m/s^2'), true)
  assert.equal(checkPracticeAnswer({ ...numeric, correctAnswer: '0.75' }, '3/4'), true)
  assert.equal(checkPracticeAnswer({ ...numeric, correctAnswer: '0' }, '0'), true)
  assert.equal(checkPracticeAnswer({ ...numeric, correctAnswer: '0' }, '0.5'), false)
  assert.equal(checkPracticeAnswer(numeric, 'abc'), false)
})

test('tolerance only applies to numeric steps', () => {
  assert.equal(checkPracticeAnswer({ ...text, correctAnswer: '4', acceptableAnswers: [] }, '4.03'), false)
})

test('multiple choice matches by option letter', () => {
  const step = { answerType: 'multiple_choice' as const, correctAnswer: 'B', acceptableAnswers: [] }
  assert.equal(checkPracticeAnswer(step, 'b'), true)
  assert.equal(checkPracticeAnswer(step, 'B)'), true)
  assert.equal(checkPracticeAnswer(step, 'B. O(V + E)'), true)
  assert.equal(checkPracticeAnswer(step, 'C'), false)
  const withText = { answerType: 'multiple_choice' as const, correctAnswer: 'B) O(V + E)', acceptableAnswers: [] }
  assert.equal(checkPracticeAnswer(withText, 'B'), true)
  assert.equal(checkPracticeAnswer(withText, 'o(v + e)'), false)
})

test('parseNumber and withinTolerance', () => {
  assert.equal(parseNumber('6.02e23'), 6.02e23)
  assert.equal(parseNumber('-3.5 cm'), -3.5)
  assert.equal(parseNumber('x'), null)
  assert.equal(parseNumber('1/0'), null)
  assert.equal(withinTolerance(101, 100), true)
  assert.equal(withinTolerance(102, 100), false)
})

test('splitChoices pulls option lines out of the question', () => {
  const parsed = splitChoices('Which is faster?\nA) O(n)\nB) O(n log n)\nC) O(n^2)')
  assert.equal(parsed?.stem, 'Which is faster?')
  assert.deepEqual(parsed?.options.map((option) => option.id), ['A', 'B', 'C'])
  assert.equal(splitChoices('What is 2 + 2?'), null)
})
