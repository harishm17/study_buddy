/**
 * API route for material uploads
 * POST /api/projects/[projectId]/materials
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/get-session'
import { uploadFile, generateMaterialPath } from '@/lib/storage/gcs'
import { enqueueValidationJob } from '@/lib/tasks/cloud-tasks'
import { z } from 'zod'

const uploadSchema = z.object({
  category: z.enum(['lecture_notes', 'sample_exams', 'book_chapters']),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // 1. Authenticate user
    const session = await requireAuth()
    const { projectId } = params

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
    const file = formData.get('file') as File
    const category = formData.get('category') as string

    if (!file) {
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
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
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

    // 6. Create material record
    const material = await prisma.material.create({
      data: {
        projectId,
        category: validation.data.category,
        filename: file.name,
        sizeBytes: BigInt(file.size),
        validationStatus: 'pending',
        gcsPath: '', // Will update after upload
      },
    })

    // 7. Upload to GCS
    const buffer = Buffer.from(await file.arrayBuffer())
    const gcsPath = generateMaterialPath(
      session.user.id,
      projectId,
      material.id,
      file.name
    )
    const fullGcsPath = await uploadFile(buffer, gcsPath)

    // 8. Update material with GCS path
    await prisma.material.update({
      where: { id: material.id },
      data: { gcsPath: fullGcsPath },
    })

    // 9. Create processing job
    const job = await prisma.processingJob.create({
      data: {
        userId: session.user.id,
        projectId,
        jobType: 'validate_material',
        status: 'pending',
        inputData: { materialId: material.id },
        progressPercent: 0,
      },
    })

    // 10. Enqueue validation task
    await enqueueValidationJob(job.id, material.id)

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
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth()
    const { projectId } = params

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
