/**
 * Google Cloud Storage client wrapper
 * Handles file uploads and downloads with signed URLs
 */

import { Storage } from '@google-cloud/storage'

// Initialize GCS client
// In production, this uses Application Default Credentials
// In development with docker-compose, we'll use local storage simulation
const storage = process.env.NODE_ENV === 'production'
  ? new Storage({
      projectId: process.env.GCS_PROJECT_ID,
    })
  : null

const BUCKET_NAME = process.env.GCS_BUCKET || 'studybuddy-materials'

/**
 * Upload a file to GCS
 * @param file - File buffer
 * @param path - Destination path in bucket (e.g., user_id/project_id/material_id/filename.pdf)
 * @returns GCS path (gs://bucket/path)
 */
export async function uploadFile(
  file: Buffer,
  path: string
): Promise<string> {
  if (!storage) {
    // Development mode - simulate upload
    console.log(`[DEV] Simulating file upload to: ${path}`)
    return `gs://${BUCKET_NAME}/${path}`
  }

  const bucket = storage.bucket(BUCKET_NAME)
  const blob = bucket.file(path)

  await blob.save(file, {
    metadata: {
      contentType: 'application/pdf',
    },
  })

  return `gs://${BUCKET_NAME}/${path}`
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
  if (!storage) {
    console.log(`[DEV] Simulating file deletion: ${gcsPath}`)
    return
  }

  const path = gcsPath.replace(`gs://${BUCKET_NAME}/`, '')
  const bucket = storage.bucket(BUCKET_NAME)
  await bucket.file(path).delete()
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
