/**
 * API route for material uploads
 * POST /api/projects/[projectId]/materials
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { uploadFile, generateMaterialPath, deleteFile } from '@/lib/storage/gcs'
import { enqueueValidationJob, TaskEnqueueError } from '@/lib/tasks/cloud-tasks'
import { z } from 'zod'

const uploadSchema = z.object({
  category: z.enum(['lecture_notes', 'sample_exams', 'book_chapters']),
})

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.pptx', '.doc'])

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return filename.slice(dotIndex).toLowerCase()
}

function hasZipMagicHeader(buffer: Buffer): boolean {
  if (buffer.length < 4) return false
  const h0 = buffer[0]
  const h1 = buffer[1]
  const h2 = buffer[2]
  const h3 = buffer[3]
  return (
    h0 === 0x50 &&
    h1 === 0x4b &&
    ((h2 === 0x03 && h3 === 0x04) || (h2 === 0x05 && h3 === 0x06) || (h2 === 0x07 && h3 === 0x08))
  )
}

function hasOleMagicHeader(buffer: Buffer): boolean {
  if (buffer.length < 8) return false
  const signature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  return buffer.subarray(0, 8).equals(signature)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // 1. Authenticate user
    const session = await requireAuth()
    const { projectId } = await params

    // 2. Verify project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // 3. Parse form data
    const formData = await request.formData()
    const file = formData.get('file')
    const category = formData.get('category') as string

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // 4. Validate input
    const validation = uploadSchema.safeParse({ category })
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid category', details: validation.error },
        { status: 400 }
      )
    }

    // 5. Validate file
    const extension = getExtension(file.name)
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Supported: PDF, DOCX, PPTX, DOC' },
        { status: 400 }
      )
    }
    const allowedMimeTypes = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/octet-stream', // Common fallback from browsers/OS integrations
      '',
    ])
    if (!allowedMimeTypes.has(file.type)) {
      return NextResponse.json(
        { error: 'Invalid MIME type for selected document' },
        { status: 400 }
      )
    }

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }

    // 6. Generate material ID upfront for GCS path
    const { randomUUID } = await import('crypto')
    const materialId = randomUUID()

    // 7. Validate file signature and upload to storage first.
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfMagic = buffer.subarray(0, 5).toString('ascii')
    const isValidSignature =
      (extension === '.pdf' && pdfMagic === '%PDF-') ||
      ((extension === '.docx' || extension === '.pptx') && hasZipMagicHeader(buffer)) ||
      (extension === '.doc' && hasOleMagicHeader(buffer))

    if (!isValidSignature) {
      return NextResponse.json(
        { error: `Uploaded file failed signature validation for ${extension.toUpperCase()}` },
        { status: 400 }
      )
    }

    // This prevents orphaned DB records if upload fails.
    const gcsPath = generateMaterialPath(
      session.user.id,
      projectId,
      materialId,
      file.name
    )
    const fullGcsPath = await uploadFile(buffer, gcsPath, file.type)

    // 8. Create material record with correct GCS path
    // Only after successful upload to prevent orphaned records
    const material = await prisma.material.create({
      data: {
        id: materialId,
        projectId,
        category: validation.data.category,
        filename: file.name,
        sizeBytes: BigInt(file.size),
        validationStatus: 'pending',
        gcsPath: fullGcsPath,
        metadata: {
          mimeType: file.type || null,
          extension,
        },
      },
    })

    // 9. Create processing job
    const job = await prisma.processingJob.create({
      data: {
        userId: session.user.id,
        projectId,
        jobType: 'validate_material',
        status: 'pending',
        stage: 'validating',
        inputData: { materialId: material.id },
        progressPercent: 0,
      },
    })

    // 10. Enqueue validation task
    try {
      await enqueueValidationJob(job.id, material.id)
    } catch (enqueueError) {
      const retryable = enqueueError instanceof TaskEnqueueError
        ? enqueueError.retryable
        : true
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorCode: retryable ? 'ENQUEUE_FAILED' : 'ENQUEUE_PERMANENT',
          errorMessage: 'Failed to enqueue validation job',
          retryable,
          completedAt: new Date(),
        },
      })

      // Best-effort cleanup to avoid keeping unprocessable artifacts.
      try {
        await deleteFile(fullGcsPath)
      } catch (cleanupError) {
        console.warn('Failed to delete uploaded file after enqueue failure:', cleanupError)
      }

      await prisma.material.delete({
        where: { id: material.id },
      })

      return NextResponse.json(
        { error: 'Failed to start material validation' },
        { status: 502 }
      )
    }

    // 11. Return response
    return NextResponse.json({
      material: {
        id: material.id,
        filename: material.filename,
        category: material.category,
        sizeBytes: material.sizeBytes.toString(),
        validationStatus: material.validationStatus,
        uploadedAt: material.uploadedAt,
      },
      jobId: job.id,
    })
  } catch (error) {
    console.error('Material upload error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to upload material' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/projects/[projectId]/materials
 * List all materials for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireAuth()
    const { projectId } = await params

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Fetch materials
    const materials = await prisma.material.findMany({
      where: { projectId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        filename: true,
        category: true,
        sizeBytes: true,
        validationStatus: true,
        validationNotes: true,
        uploadedAt: true,
        validatedAt: true,
      },
    })

    return NextResponse.json({
      materials: materials.map(m => ({
        ...m,
        sizeBytes: m.sizeBytes.toString(),
      })),
    })
  } catch (error) {
    console.error('Fetch materials error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch materials' },
      { status: 500 }
    )
  }
}
