import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALLOWANCE_TEMPLATE } from '@/lib/budget/copy'
import {
  FALLBACK_FAILURE_MESSAGE,
  describeJobFailure,
  parseContentTarget,
  pickGenerationFailures,
  type GenerationJobRow,
} from './failure-message'

test('the daily budget message never shows the job message, which carries dollar figures', () => {
  const text = describeJobFailure(
    'LLM_DAILY_BUDGET',
    'Daily AI usage limit reached ($4.13 of $3.00 used today, UTC). It is available again after midnight UTC.'
  )
  assert.equal(text, ALLOWANCE_TEMPLATE)
  assert.doesNotMatch(text, /\$|USD/)
  assert.match(text, /allowance/)
  assert.equal(describeJobFailure('LLM_DAILY_BUDGET', null), ALLOWANCE_TEMPLATE)
})

test('missing source material explains what to do', () => {
  assert.match(describeJobFailure('NO_SOURCE_MATERIAL', 'No relevant chunks found for topic x'), /Add material/)
  assert.match(describeJobFailure('NO_CONTENT_MATERIALS', 'x'), /Mark at least one as course content/)
})

test('raw server messages never reach the student for other codes', () => {
  const text = describeJobFailure('SOMETHING_ELSE', 'psycopg2.errors.UniqueViolation: secret detail')
  assert.equal(text, FALLBACK_FAILURE_MESSAGE)
  assert.equal(describeJobFailure(null, 'boom'), FALLBACK_FAILURE_MESSAGE)
})

test('content targets parse, and other keys do not', () => {
  assert.deepEqual(parseContentTarget('content:abc-123:topic_quiz'), { topicId: 'abc-123', contentType: 'topic_quiz' })
  assert.equal(parseContentTarget('extract:p1'), null)
  assert.equal(parseContentTarget(null), null)
})

const row = (id: string, targetKey: string, status: string, errorCode: string | null = null): GenerationJobRow => ({
  id,
  targetKey,
  status,
  errorCode,
  errorMessage: null,
})

test('a failure is listed when its latest job failed and the content is missing', () => {
  const failures = pickGenerationFailures(
    [row('j2', 'content:t1:topic_quiz', 'failed', 'NO_SOURCE_MATERIAL'), row('j1', 'content:t1:topic_quiz', 'failed', 'LLM_UNAVAILABLE')],
    () => false
  )
  assert.equal(failures.length, 1)
  assert.equal(failures[0].jobId, 'j2')
  assert.equal(failures[0].errorCode, 'NO_SOURCE_MATERIAL')
})

test('a retry that is running or finished clears the failure', () => {
  assert.deepEqual(
    pickGenerationFailures([row('j2', 'content:t1:topic_quiz', 'processing'), row('j1', 'content:t1:topic_quiz', 'failed')], () => false),
    []
  )
  assert.deepEqual(
    pickGenerationFailures([row('j2', 'content:t1:topic_quiz', 'completed'), row('j1', 'content:t1:topic_quiz', 'failed')], () => false),
    []
  )
})

test('a failure is dropped once the content exists anyway', () => {
  const failures = pickGenerationFailures(
    [row('j1', 'content:t1:section_notes', 'failed'), row('j3', 'content:t2:section_notes', 'failed')],
    (topicId, type) => topicId === 't1' && type === 'section_notes'
  )
  assert.deepEqual(failures.map((failure) => failure.topicId), ['t2'])
})

test('jobs without a content target are ignored', () => {
  assert.deepEqual(pickGenerationFailures([row('j1', 'extract:p1', 'failed')], () => false), [])
})

test('a failure names the job that failed, not "generation"', () => {
  // Each kind of job fails with its own default code; the text is about what the student asked for.
  assert.match(describeJobFailure('EXAM_GRADING_FAILED'), /grading/i)
  assert.match(describeJobFailure('EXAM_GENERATION_FAILED'), /mock exam/i)
  assert.match(describeJobFailure('TOPIC_EXTRACTION_FAILED'), /topics/i)
  assert.match(describeJobFailure('CHUNKING_FAILED'), /pages of this file/)
  // An unknown code falls back by job type, and only then to the plain sentence.
  assert.match(describeJobFailure('SOMETHING_ELSE', null, 'grade_exam'), /grade/i)
  assert.match(describeJobFailure(null, null, 'generate_exam'), /mock exam/i)
  for (const type of ['validate_material', 'chunk_material', 'extract_topics', 'generate_content', 'generate_exam', 'grade_exam']) {
    assert.doesNotMatch(describeJobFailure(null, null, type), /Generation failed/)
  }
})
