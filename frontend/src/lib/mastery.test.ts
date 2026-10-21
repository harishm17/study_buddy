import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countMasteryLevels,
  masteryDescription,
  masteryLabel,
  masteryLevel,
  masteryPercent,
  masteryTone,
} from './mastery'

test('no mastery row is Not started', () => {
  assert.equal(masteryLevel(null), 'none')
  assert.equal(masteryLevel(undefined), 'none')
  assert.equal(masteryLabel(null), 'Not started')
})

test('level boundaries: below 0.40, 0.40 to 0.79, 0.80 and up', () => {
  assert.equal(masteryLevel(0), 'learning')
  assert.equal(masteryLevel(0.399), 'learning')
  assert.equal(masteryLevel(0.4), 'getting')
  assert.equal(masteryLevel(0.79), 'getting')
  assert.equal(masteryLevel(0.8), 'strong')
  assert.equal(masteryLevel(1), 'strong')
})

test('labels follow the levels', () => {
  assert.equal(masteryLabel(0.2), 'Learning')
  assert.equal(masteryLabel(0.62), 'Getting there')
  assert.equal(masteryLabel(0.95), 'Strong')
})

test('percent rounds down and is clamped', () => {
  assert.equal(masteryPercent(0.62), 62)
  assert.equal(masteryPercent(0.29), 29)
  assert.equal(masteryPercent(0.799), 79)
  assert.equal(masteryPercent(1.4), 100)
  assert.equal(masteryPercent(-1), 0)
  assert.equal(masteryPercent(null), null)
})

test('description reads like the tooltip in the design', () => {
  assert.equal(masteryDescription(0.62), 'Getting there, 62%')
  assert.equal(masteryDescription(undefined), 'Not started')
})

test('only learning uses the warning tone', () => {
  assert.equal(masteryTone('learning'), 'warning')
  assert.equal(masteryTone('getting'), 'accent')
  assert.equal(masteryTone('strong'), 'accent')
  assert.equal(masteryTone('none'), 'neutral')
})

test('counts per level', () => {
  assert.deepEqual(countMasteryLevels(['strong', 'none', 'strong', 'learning']), {
    none: 1,
    learning: 1,
    getting: 0,
    strong: 2,
  })
})
