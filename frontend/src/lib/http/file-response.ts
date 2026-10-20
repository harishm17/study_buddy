/** Helpers for serving a stored file: byte ranges, content type and Content-Disposition. */

export type ByteRange = { start: number; end: number }

/**
 * Parse a `Range: bytes=...` header for a file of `size` bytes.
 *
 * Returns null when there is no usable header (serve the whole file), the range (inclusive
 * `end`, clamped to the file), or 'unsatisfiable' when it starts past the end (answer 416).
 * Only a single range is supported; PDF viewers ask for one at a time.
 */
export function parseByteRange(header: string | null | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, first, last] = match
  if (first === '' && last === '') return null

  if (first === '') {
    // "-N": the last N bytes.
    const count = Number(last)
    if (count === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - count), end: size - 1 }
  }

  const start = Number(first)
  if (start >= size) return 'unsatisfiable'
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
  if (end < start) return null
  return { start, end }
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  ppt: 'application/vnd.ms-powerpoint',
}

export function contentTypeForFilename(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop() ?? ''
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

/** Only PDFs are shown in the browser; other types download. */
export function isInlineContentType(contentType: string): boolean {
  return contentType === 'application/pdf'
}

/** `inline; filename="..."; filename*=UTF-8''...` with a header-safe name. */
export function contentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const cleaned = filename.replace(/[\r\n\\"/]/g, '_')
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, '_')
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
