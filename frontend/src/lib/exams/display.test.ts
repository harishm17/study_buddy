import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { examTitle } from './display'

describe('examTitle', () => {
  it('names generated exams "Mock exam" by date and keeps custom names', () => {
    assert.equal(examTitle('Sample Exam - 2026-10-20', '2026-10-20T12:00:00Z'), 'Mock exam, Oct 20')
    assert.equal(examTitle('Mock exam - 2026-10-20', '2026-10-20T12:00:00Z'), 'Mock exam, Oct 20')
    assert.equal(examTitle('Midterm drill', '2026-10-20T12:00:00Z'), 'Midterm drill')
  })
})
