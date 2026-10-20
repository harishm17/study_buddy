import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseS3Path } from './s3'

test('parseS3Path splits bucket and key', () => {
  assert.deepEqual(parseS3Path('s3://materials-abc/u1/p1/materials/m1/notes.pdf'), {
    bucket: 'materials-abc',
    key: 'u1/p1/materials/m1/notes.pdf',
  })
})

test('parseS3Path ignores other storage paths and bucket-only paths', () => {
  assert.equal(parseS3Path('gs://bucket/u1/p1/notes.pdf'), null)
  assert.equal(parseS3Path('/data/uploads/notes.pdf'), null)
  assert.equal(parseS3Path('s3://only-a-bucket'), null)
  assert.equal(parseS3Path('s3://only-a-bucket/'), null)
})
