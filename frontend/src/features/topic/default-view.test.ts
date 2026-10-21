import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultView } from './default-view'

test('opens on the first unfinished view', () => {
  assert.equal(defaultView({ notes: false, examples: false, quiz: false }), 'notes')
  assert.equal(defaultView({ notes: true, examples: false, quiz: false }), 'examples')
  assert.equal(defaultView({ notes: true, examples: true, quiz: false }), 'quiz')
  assert.equal(defaultView({ notes: false, examples: true, quiz: true }), 'notes')
})

test('opens on the notes when everything is done', () => {
  assert.equal(defaultView({ notes: true, examples: true, quiz: true }), 'notes')
})
