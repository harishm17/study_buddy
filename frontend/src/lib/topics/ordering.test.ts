import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeKeywordLists, moveInOrder } from './ordering'

test('moves an id forward and back', () => {
  assert.deepEqual(moveInOrder(['a', 'b', 'c', 'd'], 'a', 2), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveInOrder(['a', 'b', 'c', 'd'], 'd', 1), ['a', 'd', 'b', 'c'])
})

test('clamps the position to the ends', () => {
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 'b', -5), ['b', 'a', 'c'])
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 'b', 99), ['a', 'c', 'b'])
})

test('an unknown id leaves the order alone, and the input is not changed', () => {
  const ids = ['a', 'b']
  assert.deepEqual(moveInOrder(ids, 'x', 0), ['a', 'b'])
  moveInOrder(ids, 'b', 0)
  assert.deepEqual(ids, ['a', 'b'])
})

test('merged keywords drop case-insensitive repeats and blanks', () => {
  assert.deepEqual(
    mergeKeywordLists(['Stack', 'heap'], ['stack', ' Queue ', '']),
    ['Stack', 'heap', 'Queue']
  )
})
