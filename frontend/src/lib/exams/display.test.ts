import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { examTitle, examTitles } from './display'

describe('examTitle', () => {
  it('names generated exams "Mock exam" by date and keeps custom names', () => {
    assert.equal(examTitle('Sample Exam - 2026-10-20', '2026-10-20T12:00:00Z'), 'Mock exam, Oct 20')
    assert.equal(examTitle('Mock exam - 2026-10-20', '2026-10-20T12:00:00Z'), 'Mock exam, Oct 20')
    assert.equal(examTitle('Midterm drill', '2026-10-20T12:00:00Z'), 'Midterm drill')
  })
})

describe('examTitles', () => {
  it('tells exams made on the same day apart, in the order they were made', () => {
    const titles = examTitles([
      { id: 'b', name: 'Sample Exam - 2026-10-21', createdAt: '2026-10-21T18:00:00Z' },
      { id: 'a', name: 'Sample Exam - 2026-10-21', createdAt: '2026-10-21T15:00:00Z' },
      { id: 'c', name: 'Sample Exam - 2026-10-21', createdAt: '2026-10-21T19:30:00Z' },
      { id: 'd', name: 'Sample Exam - 2026-10-20', createdAt: '2026-10-20T12:00:00Z' },
    ])
    assert.equal(titles.get('a'), 'Mock exam, Oct 21')
    assert.equal(titles.get('b'), 'Mock exam, Oct 21 (2)')
    assert.equal(titles.get('c'), 'Mock exam, Oct 21 (3)')
    assert.equal(titles.get('d'), 'Mock exam, Oct 20')
  })

  it('keeps custom names, and numbers a repeated one too', () => {
    const titles = examTitles([
      { id: 'a', name: 'Midterm drill', createdAt: '2026-10-20T12:00:00Z' },
      { id: 'b', name: 'Midterm drill', createdAt: '2026-10-21T12:00:00Z' },
    ])
    assert.equal(titles.get('a'), 'Midterm drill')
    assert.equal(titles.get('b'), 'Midterm drill (2)')
  })
})
