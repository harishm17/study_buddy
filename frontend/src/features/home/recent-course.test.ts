import test from 'node:test'
import assert from 'node:assert/strict'
import { mostRecentActivity } from './recent-course'

test('picks the course with the latest activity of any kind', () => {
  assert.equal(
    mostRecentActivity([
      { courseId: 'a', at: new Date('2026-10-18T10:00:00Z') },
      { courseId: 'b', at: new Date('2026-10-19T09:00:00Z') },
      { courseId: 'a', at: new Date('2026-10-17T10:00:00Z') },
    ]),
    'b'
  )
})

test('ignores missing times and returns null when there is no activity', () => {
  assert.equal(mostRecentActivity([]), null)
  assert.equal(mostRecentActivity([{ courseId: 'a', at: null }, { courseId: 'b', at: undefined }]), null)
  assert.equal(mostRecentActivity([{ courseId: 'a', at: null }, { courseId: 'b', at: new Date(1000) }]), 'b')
})
