import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCrumbs } from './breadcrumbs'

const nav = [
  { id: 'c1', name: 'CS 161 Algorithms', topics: [{ id: 't1', name: 'Graph traversal' }] },
]

test('home and new course', () => {
  assert.deepEqual(buildCrumbs('/home', nav), [{ label: 'Home' }])
  assert.deepEqual(buildCrumbs('/courses/new', nav), [{ label: 'Home', href: '/home' }, { label: 'New course' }])
})

test('course overview is just the course', () => {
  assert.deepEqual(buildCrumbs('/courses/c1', nav), [{ label: 'CS 161 Algorithms' }])
})

test('topic page: course, topics, topic name', () => {
  assert.deepEqual(buildCrumbs('/courses/c1/topics/t1', nav), [
    { label: 'CS 161 Algorithms', href: '/courses/c1' },
    { label: 'Topics', href: '/courses/c1/topics' },
    { label: 'Graph traversal' },
  ])
})

test('sections', () => {
  assert.deepEqual(buildCrumbs('/courses/c1/materials', nav).at(-1), { label: 'Materials' })
  assert.deepEqual(buildCrumbs('/courses/c1/exams', nav).at(-1), { label: 'Mock exams' })
  assert.deepEqual(buildCrumbs('/courses/c1/exams/new', nav).at(-1), { label: 'New mock exam' })
  assert.deepEqual(buildCrumbs('/courses/c1/exams/e1/results/s1', nav).at(-1), { label: 'Results' })
  assert.deepEqual(buildCrumbs('/courses/c1/settings', nav).at(-1), { label: 'Settings' })
})

test('an unknown course still gets a sensible crumb', () => {
  assert.deepEqual(buildCrumbs('/courses/zzz/topics', nav)[0], { label: 'Course', href: '/courses/zzz' })
})
