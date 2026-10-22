import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRubric, readCriteria } from './rubric'

const written = { question_type: 'short_answer', key_points: ['Names the idea', 'Gives a reason'] }

test('a written answer is listed with a verdict per line when the grader gave one for each', () => {
  const rubric = buildRubric(written, [
    { point: 'Names the idea', result: 'met' },
    { point: 'Gives a reason', result: 'partly' },
  ])
  assert.deepEqual(rubric, [
    { text: 'Names the idea', result: 'met' },
    { text: 'Gives a reason', result: 'partly' },
  ])
})

test('without matching verdicts the lines are still listed, with no marks', () => {
  const unmarked = [
    { text: 'Names the idea', result: null },
    { text: 'Gives a reason', result: null },
  ]
  assert.deepEqual(buildRubric(written, undefined), unmarked)
  assert.deepEqual(buildRubric(written, [{ point: 'Names the idea', result: 'met' }]), unmarked)
  assert.deepEqual(buildRubric(written, [{ point: 'a', result: 'maybe' }, { point: 'b', result: 'met' }]), unmarked)
})

test('other question types and questions without key points have no rubric', () => {
  assert.equal(buildRubric({ question_type: 'multiple_choice', key_points: ['x'] }, []), null)
  assert.equal(buildRubric({ question_type: 'short_answer', key_points: [] }, []), null)
  assert.equal(buildRubric({ question_type: 'short_answer' }, []), null)
})

test('stored criteria that are not a clean list read as none', () => {
  assert.deepEqual(readCriteria('nope'), [])
  assert.deepEqual(readCriteria([{ point: 'a', result: 'met' }, 5]), [])
  assert.deepEqual(readCriteria([{ point: 'a', result: 'met' }]), [{ point: 'a', result: 'met' }])
})
