import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asQuestionList, reviewAnswer, toPublicContentData, toPublicQuestion, toPublicQuestions } from './quiz-questions'

const KEY_FIELDS = ['correct_answer', 'sample_answer', 'key_points', 'explanation', 'acceptable_answers']

const full = {
  question_type: 'multiple_choice',
  question_text: 'Pick one',
  options: [{ id: 'A', text: 'x', is_correct: false }, { id: 'B', text: 'y', is_correct: true }],
  correct_answer: 'B',
  sample_answer: 'y',
  key_points: ['why'],
  explanation: 'Because y.',
  acceptable_answers: ['B'],
  tolerance: 0.1,
  points: 2,
  difficulty: 'easy',
  concepts_tested: ['c'],
}

test('public questions carry no answer key', () => {
  const publicQuestion = toPublicQuestion(full) as Record<string, unknown>
  for (const field of KEY_FIELDS) assert.equal(field in publicQuestion, false, field)
  assert.equal('tolerance' in publicQuestion, false)
  assert.deepEqual(publicQuestion.options, [{ id: 'A', text: 'x' }, { id: 'B', text: 'y' }])
  assert.equal(publicQuestion.question_text, 'Pick one')
  assert.equal(publicQuestion.points, 2)
})

test('no key text survives anywhere in the serialised payload', () => {
  const payload = JSON.stringify(toPublicQuestions([full]))
  assert.equal(payload.includes('Because y.'), false)
  assert.equal(payload.includes('is_correct'), false)
})

test('toPublicQuestions accepts a list or an object with questions', () => {
  assert.equal(toPublicQuestions([full]).length, 1)
  assert.equal(toPublicQuestions({ questions: [full, full] }).length, 2)
  assert.deepEqual(toPublicQuestions(null), [])
  assert.deepEqual(toPublicQuestions('nope'), [])
})

test('only topic_quiz content is rewritten', () => {
  const notes = { sections: [{ title: 'a' }] }
  assert.equal(toPublicContentData('section_notes', notes), notes)
  const quiz = toPublicContentData('topic_quiz', [full]) as Array<Record<string, unknown>>
  assert.equal('correct_answer' in quiz[0], false)
})

test('asQuestionList rejects unusable data', () => {
  assert.equal(asQuestionList([]), null)
  assert.equal(asQuestionList([1, 2]), null)
  assert.equal(asQuestionList(null), null)
  assert.equal(asQuestionList([full])?.length, 1)
})

test('review answers: sample answer for short answers, the key otherwise', () => {
  assert.equal(reviewAnswer({ question_type: 'short_answer', sample_answer: 'A model answer' }), 'A model answer')
  assert.equal(reviewAnswer({ question_type: 'short_answer' }), '')
  assert.equal(reviewAnswer({ question_type: 'true_false', correct_answer: true }), 'True')
  assert.equal(reviewAnswer({ question_type: 'true_false', correct_answer: 'false' }), 'False')
  assert.equal(reviewAnswer({ question_type: 'numerical', correct_answer: 9.8, unit: 'm/s^2' }), '9.8 m/s^2')
  assert.equal(reviewAnswer({ question_type: 'multiple_choice', correct_answer: 'C' }), 'C')
})
