/**
 * Send one study file to the materials API with real upload progress.
 *
 * fetch cannot report how much of a request body has been sent, so this uses XMLHttpRequest.
 * The file is the raw request body; the category and file name travel in the query string.
 */

export type UploadResult = {
  material: { id: string; filename: string }
  jobId: string
}

export function buildUploadUrl(projectId: string, category: string, filename: string): string {
  const query = new URLSearchParams({ category, filename })
  return `/api/projects/${encodeURIComponent(projectId)}/materials?${query.toString()}`
}

/** The message from an API error body, else a message that fits the status. */
export function uploadErrorMessage(status: number, body: unknown, maxUploadMb: number): string {
  const error = (body as { error?: unknown } | null)?.error
  if (typeof error === 'string' && error) return error
  const nested = (error as { message?: unknown } | undefined)?.message
  if (typeof nested === 'string' && nested) return nested
  if (status === 413) return `File must be ${maxUploadMb} MB or smaller.`
  if (status === 401) return 'You are signed out. Sign in again to upload.'
  return 'Upload failed. Please try again.'
}

export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled')
    this.name = 'UploadAbortedError'
  }
}

type UploadOptions = {
  projectId: string
  category: string
  file: File
  maxUploadMb: number
  /** Called with 0 to 100 as bytes are sent. */
  onProgress: (percent: number) => void
  signal?: AbortSignal
}

export function uploadMaterial(options: UploadOptions): Promise<UploadResult> {
  const { projectId, category, file, maxUploadMb, onProgress, signal } = options

  return new Promise<UploadResult>((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadAbortedError())

    const xhr = new XMLHttpRequest()
    xhr.open('POST', buildUploadUrl(projectId, category, file.name))
    xhr.responseType = 'json'

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.jobId && xhr.response?.material) {
        onProgress(100)
        resolve(xhr.response as UploadResult)
        return
      }
      reject(new Error(uploadErrorMessage(xhr.status, xhr.response, maxUploadMb)))
    }
    xhr.onerror = () => reject(new Error('The connection dropped during the upload. Please try again.'))
    xhr.ontimeout = () => reject(new Error('The upload timed out. Please try again.'))

    const abort = () => {
      xhr.abort()
      reject(new UploadAbortedError())
    }
    signal?.addEventListener('abort', abort, { once: true })
    xhr.onloadend = () => signal?.removeEventListener('abort', abort)

    // The browser sets Content-Length itself, and the file's own type as Content-Type.
    xhr.send(file)
  })
}
