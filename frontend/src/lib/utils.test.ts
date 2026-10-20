import test from 'node:test'
import assert from 'node:assert/strict'
import { cn } from './utils'

test('cn keeps a custom text size and a text colour together', () => {
  assert.equal(cn('text-small text-fg'), 'text-small text-fg')
  assert.equal(cn('text-fg-2 text-title'), 'text-fg-2 text-title')
})

test('cn lets a later custom text size replace an earlier one', () => {
  assert.equal(cn('text-small', 'text-title'), 'text-title')
})

test('cn lets a later radius or colour win', () => {
  assert.equal(cn('rounded-control', 'rounded-card'), 'rounded-card')
  assert.equal(cn('bg-surface', 'bg-accent'), 'bg-accent')
  assert.equal(cn('px-2', false && 'px-4', 'px-3'), 'px-3')
})

test('cn knows the design z layers', () => {
  assert.equal(cn('z-sidebar', 'z-modal'), 'z-modal')
  assert.equal(cn('z-10', 'z-popper'), 'z-popper')
})
