'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatBytes, isValidStudyMaterial, isValidFileSize } from '@/lib/utils'
import { useJobPolling } from '@/hooks/useJobPolling'

interface MaterialUploadProps {
  projectId: string
}

type MaterialCategory = 'lecture_notes' | 'sample_exams' | 'book_chapters'

interface UploadingFile {
  id: string
  file: File
  category: MaterialCategory
  progress: number
  status: 'uploading' | 'validating' | 'completed' | 'invalid' | 'error'
  error?: string
  materialId?: string
  jobId?: string
}

const CATEGORIES = [
  { value: 'lecture_notes', label: 'Lecture Notes', description: 'Slides and lecture materials' },
  { value: 'sample_exams', label: 'Sample Exams', description: 'Previous year exams and practice tests' },
  { value: 'book_chapters', label: 'Book Chapters', description: 'Textbook chapters and reading materials' },
] as const

export function MaterialUpload({ projectId }: MaterialUploadProps) {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory>('lecture_notes')
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isExtractingTopics, setIsExtractingTopics] = useState(false)
  const [postUploadMessage, setPostUploadMessage] = useState<string | null>(null)
  const isMountedRef = useRef(true)
  const { pollJob, stopPolling } = useJobPolling({ timeoutMs: 90_000 })

  const hasInFlightUploads = uploadingFiles.some(
    (file) => file.status === 'uploading' || file.status === 'validating'
  )
  const validCount = uploadingFiles.filter((file) => file.status === 'completed').length
  const invalidCount = uploadingFiles.filter((file) => file.status === 'invalid').length
  const failedCount = uploadingFiles.filter((file) => file.status === 'error').length
  const canContinueToProject = uploadingFiles.length > 0 && !hasInFlightUploads

  const handleExtractTopics = useCallback(async () => {
    setIsExtractingTopics(true)
    setPostUploadMessage(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/extract-topics`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message =
          payload?.error?.message ||
          payload?.message ||
          'Could not start topic extraction. Please retry from the project page.'
        setPostUploadMessage(message)
        return
      }

      const jobId = typeof payload?.jobId === 'string' ? payload.jobId : null
      if (!jobId) {
        router.push(`/projects/${projectId}/topics/review`)
        return
      }

      const pollResult = await pollJob(jobId)
      if (pollResult.state !== 'completed') {
        setPostUploadMessage(
          pollResult.error || 'Topic extraction did not complete. You can retry from the project page.'
        )
        return
      }

      router.push(`/projects/${projectId}/topics/review`)
    } catch {
      setPostUploadMessage('Could not start topic extraction. Please retry from the project page.')
    } finally {
      setIsExtractingTopics(false)
    }
  }, [pollJob, projectId, router])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      stopPolling()
    }
  }, [stopPolling])

  const uploadFile = useCallback(async (uploadingFile: UploadingFile) => {
    try {
      // Create form data
      const formData = new FormData()
      formData.append('file', uploadingFile.file)
      formData.append('category', uploadingFile.category)

      // Upload to API
      const response = await fetch(`/api/projects/${projectId}/materials`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let message = 'Upload failed'
        try {
          const errorPayload = await response.json()
          if (typeof errorPayload?.error === 'string') {
            message = errorPayload.error
          }
        } catch {
          // Fallback to default message.
        }
        throw new Error(message)
      }

      const data = await response.json()

      // Update status to validating
      if (!isMountedRef.current) return
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFile.id
            ? { ...f, status: 'validating', progress: 50, materialId: data.material.id, jobId: data.jobId }
            : f
        )
      )

      // Poll for validation status
      const pollResult = await pollJob(data.jobId, (job) => {
        if (!isMountedRef.current) return
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? { ...f, progress: 50 + (Math.max(0, Math.min(100, job.progressPercent)) / 2) }
              : f
          )
        )
      })

      if (!isMountedRef.current) return
      if (pollResult.state === 'completed') {
        const resultData = (pollResult.job?.raw?.resultData || null) as Record<string, unknown> | null
        const validationStatus =
          typeof resultData?.validation_status === 'string'
            ? resultData.validation_status.toLowerCase()
            : 'valid'
        const validationNotes =
          typeof resultData?.notes === 'string' ? resultData.notes : null

        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? validationStatus === 'invalid'
                ? {
                    ...f,
                    status: 'invalid',
                    progress: 100,
                    error: validationNotes || 'Validation rejected this file.',
                  }
                : { ...f, status: 'completed', progress: 100 }
              : f
          )
        )
      } else {
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? { ...f, status: 'error', error: pollResult.error || 'Validation failed. Please retry.' }
              : f
          )
        )
      }

    } catch (error) {
      console.error('Upload error:', error)
      if (!isMountedRef.current) return
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFile.id
            ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
            : f
        )
      )
    }
  }, [pollJob, projectId])

  const handleFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`

      // Validate file
      if (!isValidStudyMaterial(file)) {
        setUploadingFiles(prev => [
          ...prev,
          {
            id,
            file,
            category: selectedCategory,
            progress: 0,
            status: 'error',
            error: 'Supported formats: PDF, DOCX, PPTX, DOC',
          },
        ])
        continue
      }

      if (!isValidFileSize(file, 10)) {
        setUploadingFiles(prev => [
          ...prev,
          {
            id,
            file,
            category: selectedCategory,
            progress: 0,
            status: 'error',
            error: 'File exceeds 10MB limit',
          },
        ])
        continue
      }

      // Add to uploading list
      const uploadingFile: UploadingFile = {
        id,
        file,
        category: selectedCategory,
        progress: 0,
        status: 'uploading',
      }

      setUploadingFiles(prev => [...prev, uploadingFile])

      // Start upload
      await uploadFile(uploadingFile)
    }
  }, [selectedCategory, uploadFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }, [handleFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
    // Reset input
    e.target.value = ''
  }, [handleFiles])


  const removeFile = (uploadId: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId))
  }

  return (
    <div className="space-y-6">
      {/* Category Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Material Category</CardTitle>
          <CardDescription>Select the type of material you&apos;re uploading</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value as MaterialCategory)}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  selectedCategory === cat.value
                    ? 'border-primary/50 bg-primary/10 shadow-sm'
                    : 'border-border hover:border-primary/30 hover:bg-white/70'
                }`}
              >
                <div className="font-semibold">{cat.label}</div>
                <div className="text-sm text-muted-foreground">{cat.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>PDF, DOCX, PPTX, DOC files, max 10MB each.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-12 text-center transition ${
              isDragging
                ? 'border-primary bg-primary/10'
                : 'border-border bg-white/60 hover:border-primary/35 hover:bg-white/85'
            }`}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">
              Drop study files here or click to browse
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Uploading to: <Badge variant="outline">{CATEGORIES.find(c => c.value === selectedCategory)?.label}</Badge>
            </p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              multiple
              onChange={handleFileInput}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input">
              <Button asChild>
                <span>Browse Files</span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploads</CardTitle>
            <CardDescription>{uploadingFiles.length} file(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {uploadingFiles.map((upload) => (
                <div key={upload.id} className="rounded-xl border border-border/70 bg-white/75 p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="font-medium truncate">{upload.file.name}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(upload.id)}
                          disabled={upload.status === 'uploading' || upload.status === 'validating'}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <span>{formatBytes(upload.file.size)}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORIES.find(c => c.value === upload.category)?.label}
                        </Badge>
                      </div>
                      {upload.status === 'error' ? (
                        <p className="text-sm text-destructive">{upload.error}</p>
                      ) : upload.status === 'invalid' ? (
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          Validation flagged this file: {upload.error}
                        </p>
                      ) : upload.status === 'completed' ? (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          ✓ Validation complete
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>
                              {upload.status === 'uploading' ? 'Uploading...' : 'Validating...'}
                            </span>
                          </div>
                          <Progress value={upload.progress} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {canContinueToProject && (
              <div className="mt-6 rounded-xl border border-border/70 bg-white/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Upload summary</div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        {validCount} valid
                      </span>
                      {(invalidCount > 0 || failedCount > 0) && (
                        <span className="inline-flex items-center gap-1">
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                          {invalidCount + failedCount} need attention
                        </span>
                      )}
                    </div>
                    {postUploadMessage && (
                      <div className="text-sm text-amber-700 dark:text-amber-300">{postUploadMessage}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {validCount > 0 && (
                      <Button onClick={handleExtractTopics} disabled={isExtractingTopics}>
                        {isExtractingTopics ? 'Starting...' : 'Extract Topics Now'}
                      </Button>
                    )}
                    <Button variant="back" size="back" onClick={() => router.push(`/projects/${projectId}`)}>
                      Back to Project
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
