import assert from 'node:assert/strict'
import test from 'node:test'
import { canBeTopicSource, isMaterialRole, readRole, roleForCategory, ROLE_LABELS } from './role'

test('the upload category sets the first role', () => {
  assert.equal(roleForCategory('syllabus'), 'syllabus')
  assert.equal(roleForCategory('sample_exams'), 'exam')
  assert.equal(roleForCategory('lecture_notes'), 'content')
  assert.equal(roleForCategory('book_chapters'), 'content')
})

test('only content and other files can be topic sources', () => {
  assert.deepEqual(
    (['content', 'syllabus', 'exam', 'other'] as const).map(canBeTopicSource),
    [true, false, false, true]
  )
})

test('roles have labels and unknown values read as content', () => {
  assert.equal(ROLE_LABELS.exam, 'Past exam')
  assert.equal(isMaterialRole('syllabus'), true)
  assert.equal(isMaterialRole('homework'), false)
  assert.equal(readRole('homework'), 'content')
  assert.equal(readRole(null), 'content')
  assert.equal(readRole('exam'), 'exam')
})
