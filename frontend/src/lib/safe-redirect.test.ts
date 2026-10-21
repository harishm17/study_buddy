import test from 'node:test'
import assert from 'node:assert/strict'
import { loginUrl, safeNextPath } from './safe-redirect'

test('follows paths on this site', () => {
  assert.equal(safeNextPath('/courses/abc/topics?edit=1'), '/courses/abc/topics?edit=1')
})

test('refuses anything that could leave the site', () => {
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '', undefined, null, 42]) {
    assert.equal(safeNextPath(bad), '/home')
  }
})

test('does not bounce between the auth pages', () => {
  assert.equal(safeNextPath('/login?next=/home'), '/home')
  assert.equal(safeNextPath('/signup'), '/home')
})

test('loginUrl keeps the way back', () => {
  assert.equal(loginUrl('/courses/x'), '/login?next=%2Fcourses%2Fx')
  assert.equal(loginUrl(null), '/login')
})
