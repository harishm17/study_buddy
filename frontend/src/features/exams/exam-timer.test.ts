import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseFlagState, timeNotice, timerTone } from './exam-timer'

describe('timerTone', () => {
  it('turns warning under five minutes and danger under one', () => {
    assert.equal(timerTone(301), 'normal')
    assert.equal(timerTone(300), 'warning')
    assert.equal(timerTone(61), 'warning')
    assert.equal(timerTone(60), 'danger')
    assert.equal(timerTone(0), 'danger')
  })
})

describe('timeNotice', () => {
  it('shows each notice only just after its threshold', () => {
    assert.equal(timeNotice(600), null)
    assert.equal(timeNotice(300)?.tone, 'warning')
    assert.equal(timeNotice(280), null)
    assert.equal(timeNotice(60)?.tone, 'danger')
    assert.equal(timeNotice(30), null)
    assert.equal(timeNotice(0), null)
  })
})

describe('parseFlagState', () => {
  it('keeps valid flags and a clamped position', () => {
    assert.deepEqual(parseFlagState('{"flags":[1,1,3,99,"x"],"position":7}', 5), { flags: [1, 3], position: 4 })
  })
  it('falls back for missing or broken values', () => {
    assert.deepEqual(parseFlagState(null, 5), { flags: [], position: 0 })
    assert.deepEqual(parseFlagState('{oops', 5), { flags: [], position: 0 })
  })
})
