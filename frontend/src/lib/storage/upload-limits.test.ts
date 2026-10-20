import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable, Writable } from 'stream'
import { pipeline } from 'stream/promises'
import {
  IncompleteUploadError,
  InvalidSignatureError,
  UploadTooLargeError,
  checkContentLength,
  createSignatureCheck,
  createSizeLimiter,
  hasValidSignature,
  maxUploadBytes,
  maxUploadMb,
} from './upload-limits'

const MB = 1024 * 1024

test('the limit is 25 MB unless MAX_UPLOAD_MB says otherwise', () => {
  assert.equal(maxUploadMb({}), 25)
  assert.equal(maxUploadBytes({}), 25 * MB)
  assert.equal(maxUploadMb({ MAX_UPLOAD_MB: '40' }), 40)
  assert.equal(maxUploadMb({ MAX_UPLOAD_MB: 'abc' }), 25)
  assert.equal(maxUploadMb({ MAX_UPLOAD_MB: '0' }), 25)
  assert.equal(maxUploadMb({ MAX_UPLOAD_MB: '-5' }), 25)
  assert.equal(maxUploadMb({ MAX_UPLOAD_MB: '100000' }), 500)
})

test('a Content-Length over the limit is refused with 413 before any body is read', () => {
  const result = checkContentLength(String(25 * MB + 1), 25 * MB)
  assert.deepEqual(result, { ok: false, status: 413, message: 'File must be 25 MB or smaller.' })
})

test('a Content-Length at the limit is accepted', () => {
  assert.deepEqual(checkContentLength(String(25 * MB), 25 * MB), { ok: true, length: 25 * MB })
  assert.deepEqual(checkContentLength('1', 25 * MB), { ok: true, length: 1 })
})

test('a missing, empty or malformed Content-Length is refused', () => {
  assert.equal(checkContentLength(null, 25 * MB).ok, false)
  assert.equal((checkContentLength(undefined, 25 * MB) as { status: number }).status, 411)
  assert.equal((checkContentLength('', 25 * MB) as { status: number }).status, 411)
  assert.equal((checkContentLength('12abc', 25 * MB) as { status: number }).status, 400)
  assert.equal((checkContentLength('-5', 25 * MB) as { status: number }).status, 400)
  assert.equal((checkContentLength('0', 25 * MB) as { status: number }).status, 400)
})

const collect = () => {
  const chunks: Buffer[] = []
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk)
      callback()
    },
  })
  return { sink, bytes: () => Buffer.concat(chunks) }
}

test('the size limiter stops a stream that sends more than the limit', async () => {
  const { stream } = createSizeLimiter(10)
  const { sink } = collect()
  await assert.rejects(
    pipeline(Readable.from([Buffer.alloc(6), Buffer.alloc(6)]), stream, sink),
    UploadTooLargeError
  )
})

test('the size limiter passes a stream within the limit and counts it', async () => {
  const { stream, bytesSeen } = createSizeLimiter(10, 8)
  const { sink, bytes } = collect()
  await pipeline(Readable.from([Buffer.alloc(5, 1), Buffer.alloc(3, 2)]), stream, sink)
  assert.equal(bytesSeen(), 8)
  assert.equal(bytes().length, 8)
})

test('the size limiter notices a body shorter than announced', async () => {
  const { stream } = createSizeLimiter(100, 50)
  const { sink } = collect()
  await assert.rejects(pipeline(Readable.from([Buffer.alloc(10)]), stream, sink), IncompleteUploadError)
})

test('signatures match the file type', () => {
  assert.equal(hasValidSignature('.pdf', Buffer.from('%PDF-1.7 rest')), true)
  assert.equal(hasValidSignature('.pdf', Buffer.from('PK\x03\x04....')), false)
  assert.equal(hasValidSignature('.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])), true)
  assert.equal(hasValidSignature('.pptx', Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0])), true)
  assert.equal(hasValidSignature('.docx', Buffer.from('%PDF-1.7')), false)
  assert.equal(
    hasValidSignature('.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])),
    true
  )
  assert.equal(hasValidSignature('.doc', Buffer.from('not ole at all')), false)
  assert.equal(hasValidSignature('.txt', Buffer.from('%PDF-')), false)
})

test('the signature check rejects a wrong file after its first bytes, even split across chunks', async () => {
  const { sink } = collect()
  await assert.rejects(
    pipeline(Readable.from([Buffer.from('MZ'), Buffer.from('\x90\x00\x03\x00\x00\x00')]), createSignatureCheck('.pdf'), sink),
    InvalidSignatureError
  )
})

test('the signature check passes a good file through unchanged', async () => {
  const { sink, bytes } = collect()
  const body = Buffer.from('%PDF-1.7\nhello world')
  await pipeline(Readable.from([body.subarray(0, 3), body.subarray(3)]), createSignatureCheck('.pdf'), sink)
  assert.deepEqual(bytes(), body)
})

test('the signature check rejects a file shorter than its signature', async () => {
  const { sink } = collect()
  await assert.rejects(pipeline(Readable.from([Buffer.from('%PD')]), createSignatureCheck('.pdf'), sink), InvalidSignatureError)
})
