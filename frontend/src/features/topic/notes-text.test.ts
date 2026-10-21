import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanNotes, readMinutes } from './notes-text'

test('removes inline citation tags', () => {
  assert.equal(
    cleanNotes('## A\n\nBFS uses a queue [Citation: week2.pdf, p. 4]. Done.'),
    '## A\n\nBFS uses a queue. Done.'
  )
})

test('removes "If you want, I can" lines and the list under them', () => {
  const out = cleanNotes('## A\n\nText.\n\nIf you want, I can:\n- make a quiz\n- write more\n\n## B\n\nMore.')
  assert.ok(!/if you want/i.test(out))
  assert.ok(!out.includes('make a quiz'))
  assert.ok(out.includes('## B'))
})

test('promotes bare section names and drops the leading title', () => {
  const out = cleanNotes('# Graph traversal\n\nOverview\nBFS goes wide.\n\nKey Concepts\n- queue')
  assert.ok(!out.startsWith('# '))
  assert.ok(out.includes('## Overview'))
  assert.ok(out.includes('## Key Concepts'))
})

test('read time is at least a minute for any text', () => {
  assert.equal(readMinutes(''), 0)
  assert.equal(readMinutes('one two three'), 1)
  assert.equal(readMinutes('word '.repeat(1000)), 5)
})
