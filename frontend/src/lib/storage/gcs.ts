/**
 * Google Cloud Storage client wrapper
 * Handles file uploads and downloads with signed URLs
 */

// Lazy-load Storage to avoid credential errors in development
let storageInstance: any = null
const CLOUD_STORAGE_ENABLED = process.env.ENABLE_GCS_STORAGE === 'true'
const ALLOW_LOCAL_FALLBACK = process.env.ALLOW_GCS_LOCAL_FALLBACK !== 'false'
const BUCKET_NAME = process.env.GCS_BUCKET || 'studybuddy-materials'
const LOCAL_UPLOAD_BASE = process.env.LOCAL_UPLOADS_DIR || '/data/uploads'
const LOCAL_UPLOAD_FALLBACK_BASE = '/tmp/studybuddy-uploads'

async function writeLocalFile(file: Buffer, storagePath: string): Promise<string> {
  const fs = await import('fs')
  const pathModule = await import('path')
  const bases = [LOCAL_UPLOAD_BASE, LOCAL_UPLOAD_FALLBACK_BASE]

  let lastError: unknown = null
  for (const base of bases) {
    const localFilePath = pathModule.join(base, storagePath)
    try {
      fs.mkdirSync(pathModule.dirname(localFilePath), { recursive: true })
      fs.writeFileSync(localFilePath, file)
      console.log('[LOCAL_STORAGE] File stored successfully')
      return `gs://${BUCKET_NAME}/${storagePath}`
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`[LOCAL_STORAGE] Failed to write uploaded file: ${String(lastError)}`)
}

async function deleteLocalFile(relativePath: string): Promise<void> {
  const fs = await import('fs')
  const pathModule = await import('path')
  const bases = [LOCAL_UPLOAD_BASE, LOCAL_UPLOAD_FALLBACK_BASE]

  for (const base of bases) {
    const localFilePath = pathModule.join(base, relativePath)
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath)
      return
    }
  }
}

async function getStorage() {
  if (!CLOUD_STORAGE_ENABLED) {
    return null
  }

  if (!process.env.GCS_PROJECT_ID) {
    console.warn('[GCS] ENABLE_GCS_STORAGE=true but GCS_PROJECT_ID is missing. Falling back to local storage.')
    return null
  }

  // In production, lazy-load Storage only when needed
  if (!storageInstance) {
    try {
      const { Storage } = await import('@google-cloud/storage')
      storageInstance = new Storage({
        projectId: process.env.GCS_PROJECT_ID,
      })
    } catch (error) {
      console.warn('[GCS] Failed to initialize Storage client:', error)
      return null
    }
  }

  return storageInstance
}

function inferContentType(storagePath: string, provided?: string): string {
  if (provided && provided.trim()) {
    return provided
  }
  const lowerPath = storagePath.toLowerCase()
  if (lowerPath.endsWith('.pdf')) return 'application/pdf'
  if (lowerPath.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (lowerPath.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  if (lowerPath.endsWith('.doc')) return 'application/msword'
  return 'application/octet-stream'
}

/**
 * Upload a file to GCS
 * @param file - File buffer
 * @param path - Destination path in bucket (e.g., user_id/project_id/material_id/filename.pdf)
 * @returns GCS path (gs://bucket/path)
 */
export async function uploadFile(
  file: Buffer,
  storagePath: string,
  contentType?: string
): Promise<string> {
  const storage = await getStorage()

  if (!storage) {
    return writeLocalFile(file, storagePath)
  }

  const bucket = storage.bucket(BUCKET_NAME)
  const blob = bucket.file(storagePath)
  try {
    await blob.save(file, {
      metadata: {
        contentType: inferContentType(storagePath, contentType),
      },
    })
    return `gs://${BUCKET_NAME}/${storagePath}`
  } catch (error) {
    if (ALLOW_LOCAL_FALLBACK) {
      console.warn('[GCS] Upload failed, falling back to local storage:', error)
      return writeLocalFile(file, storagePath)
    }
    throw error
  }
}

/**
 * Generate a signed URL for downloading a file
 * @param gcsPath - Full GCS path (gs://bucket/path)
 * @param expiresInMinutes - URL expiration time (default: 60 minutes)
 * @returns Signed URL
 */
export async function getSignedUrl(
  gcsPath: string,
  expiresInMinutes = 60
): Promise<string> {
  const storage = await getStorage()
  
  if (!storage) {
    // Development mode - return a mock URL
    return `http://localhost:4566/${gcsPath.replace('gs://', '')}`
  }

  // Extract path from gs://bucket/path
  const path = gcsPath.replace(`gs://${BUCKET_NAME}/`, '')

  const bucket = storage.bucket(BUCKET_NAME)
  const file = bucket.file(path)

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  })

  return url
}

/**
 * Delete a file from GCS
 * @param gcsPath - Full GCS path (gs://bucket/path)
 */
export async function deleteFile(gcsPath: string): Promise<void> {
  const storage = await getStorage()
  
  if (!storage) {
    const relativePath = gcsPath.replace(`gs://${BUCKET_NAME}/`, '')
    await deleteLocalFile(relativePath)
    return
  }

  const path = gcsPath.replace(`gs://${BUCKET_NAME}/`, '')
  const bucket = storage.bucket(BUCKET_NAME)
  try {
    await bucket.file(path).delete()
  } catch (error) {
    if (ALLOW_LOCAL_FALLBACK) {
      await deleteLocalFile(path)
      return
    }
    throw error
  }
}

/**
 * Generate GCS path for a material upload
 * @param userId - User ID
 * @param projectId - Project ID
 * @param materialId - Material ID
 * @param filename - Original filename
 * @returns GCS path
 */
export function generateMaterialPath(
  userId: string,
  projectId: string,
  materialId: string,
  filename: string
): string {
  // Sanitize filename
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `${userId}/${projectId}/materials/${materialId}/${sanitizedFilename}`
}
