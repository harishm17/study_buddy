import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateWords, typicalPipelineSeconds } from './estimate'

const seconds = (...values: number[]) => values.map((value) => value * 1000)

test('the typical time is the median of finished jobs, step by step', () => {
  const check = seconds(1, 1, 2, 1, 1)
  const read = seconds(20, 30, 40, 25, 100)
  // 1s + 30s, rounded to the nearest 5.
  assert.equal(typicalPipelineSeconds([check, read]), 30)
})

test('too few finished jobs give no estimate rather than a guess', () => {
  assert.equal(typicalPipelineSeconds([seconds(1, 2), seconds(20, 30, 40, 25, 100)]), null)
  assert.equal(typicalPipelineSeconds([[], []]), null)
})

test('unusable durations are ignored', () => {
  assert.equal(typicalPipelineSeconds([[0, -5, Number.NaN, ...seconds(20, 20, 20, 20, 20)]]), 20)
})

test('the estimate is worded as "about"', () => {
  assert.equal(estimateWords(3), 'a few seconds')
  assert.equal(estimateWords(20), 'about 20 seconds')
  assert.equal(estimateWords(60), 'about a minute')
  assert.equal(estimateWords(130), 'about 2 minutes')
})
