'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatBytes, isValidStudyMaterial, isValidFileSize } from '@/lib/utils'
import { pollFailureMessage, useJobPolling } from '@/hooks/useJobPolling'
import { UploadAbortedError, uploadMaterial } from '@/lib/uploads/upload-file'

interface MaterialUploadProps {
  projectId: string
  /** The server's upload limit (MAX_UPLOAD_MB), shown to the student and checked before sending. */
  maxUploadMb: number
}

type MaterialCategory = 'lecture_notes' | 'sample_exams' | 'book_chapters'

interface UploadingFile {
  id: string
  file: File
  category: MaterialCategory
  progress: number
  status: 'uploading' | 'validating' | 'processing' | 'completed' | 'invalid' | 'error'
  error?: string
  materialId?: string
  jobId?: string
  chunkingJobId?: string
}

const CATEGORIES = [
  { value: 'lecture_notes', label: 'Lecture Notes', description: 'Slides and lecture materials' },
  { value: 'sample_exams', label: 'Sample Exams', description: 'Previous year exams and practice tests' },
  { value: 'book_chapters', label: 'Book Chapters', description: 'Textbook chapters and reading materials' },
] as const

export function MaterialUpload({ projectId, maxUploadMb }: MaterialUploadProps) {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory>('lecture_notes')
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isExtractingTopics, setIsExtractingTopics] = useState(false)
  const [postUploadMessage, setPostUploadMessage] = useState<string | null>(null)
  const isMountedRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // One abort controller per file that is uploading, so a single upload can be cancelled.
  const uploadControllers = useRef(new Map<string, AbortController>())
  const [resumedCount, setResumedCount] = useState(0)
  const { pollJob, stopPolling, resumeActiveJobs } = useJobPolling({ timeoutMs: 90_000 })

  const hasInFlightUploads = uploadingFiles.some(
    (file) => file.status === 'uploading' || file.status === 'validating' || file.status === 'processing'
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
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      stopPolling()
    }
  }, [stopPolling])

  // Uploads from before a refresh are still being validated or chunked: follow them again.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const active = await resumeActiveJobs({
        projectId,
        jobTypes: ['validate_material', 'chunk_material'],
      }).catch(() => [])
      if (cancelled || active.length === 0) return
      setResumedCount(active.length)
      await Promise.all(active.map((job) => pollJob(job.id)))
      if (cancelled || !isMountedRef.current) return
      setResumedCount(0)
      router.refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [pollJob, projectId, resumeActiveJobs, router])

  const patchFile = useCallback((id: string, patch: Partial<UploadingFile>) => {
    if (!isMountedRef.current) return
    setUploadingFiles(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)))
  }, [])

  // Follow the chunking job of a validated file until its text is ready.
  const followChunking = useCallback(async (id: string, materialId: string) => {
    try {
      const chunkingResponse = await fetch(`/api/materials/${materialId}/chunking-job`)
      const chunkingData = chunkingResponse.ok ? await chunkingResponse.json() : null
      const chunkingJobId: string | undefined = chunkingData?.chunkingJob?.id
      if (!chunkingJobId) {
        // No chunking job yet: it starts in the background, so the file counts as done.
        patchFile(id, { status: 'completed', progress: 100 })
        return
      }

      const chunkingResult = await pollJob(chunkingJobId, (job) =>
        patchFile(id, { chunkingJobId, progress: Math.max(0, Math.min(100, job.progressPercent)) })
      )
      if (chunkingResult.state === 'completed') {
        patchFile(id, { status: 'completed', progress: 100 })
      } else {
        patchFile(id, {
          status: 'error',
          error: pollFailureMessage(chunkingResult, chunkingResult.error || 'Processing failed. Please retry.'),
        })
      }
    } catch (error) {
      console.error('Error getting chunking job:', error)
      // Chunking may still happen in the background.
      patchFile(id, { status: 'completed', progress: 100 })
    }
  }, [patchFile, pollJob])

  const uploadFile = useCallback(async (uploadingFile: UploadingFile) => {
    const controller = new AbortController()
    uploadControllers.current.set(uploadingFile.id, controller)
    try {
      // Send the file; the bar follows the bytes sent.
      const data = await uploadMaterial({
        projectId,
        category: uploadingFile.category,
        file: uploadingFile.file,
        maxUploadMb,
        signal: controller.signal,
        onProgress: (percent) => patchFile(uploadingFile.id, { progress: percent }),
      })
      uploadControllers.current.delete(uploadingFile.id)

      patchFile(uploadingFile.id, {
        status: 'validating',
        progress: 0,
        materialId: data.material.id,
        jobId: data.jobId,
      })

      // Validation is its own job with its own progress.
      const pollResult = await pollJob(data.jobId, (job) =>
        patchFile(uploadingFile.id, { progress: Math.max(0, Math.min(100, job.progressPercent)) })
      )
      if (!isMountedRef.current) return

      if (pollResult.state !== 'completed') {
        patchFile(uploadingFile.id, {
          status: 'error',
          error: pollFailureMessage(pollResult, pollResult.error || 'Validation failed. Please retry.'),
        })
        return
      }

      const resultData = pollResult.job?.resultData ?? null
      const validationStatus =
        typeof resultData?.validation_status === 'string'
          ? resultData.validation_status.toLowerCase()
          : 'valid'
      if (validationStatus === 'invalid') {
        const notes = typeof resultData?.notes === 'string' ? resultData.notes : null
        patchFile(uploadingFile.id, {
          status: 'invalid',
          progress: 100,
          error: notes || 'Validation rejected this file.',
        })
        return
      }

      patchFile(uploadingFile.id, { status: 'processing', progress: 0 })
      await followChunking(uploadingFile.id, data.material.id)
    } catch (error) {
      uploadControllers.current.delete(uploadingFile.id)
      if (error instanceof UploadAbortedError) {
        // Cancelled by the student: the file simply leaves the list.
        if (isMountedRef.current) setUploadingFiles(prev => prev.filter(f => f.id !== uploadingFile.id))
        return
      }
      console.error('Upload error:', error)
      patchFile(uploadingFile.id, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Upload failed',
      })
    }
  }, [followChunking, maxUploadMb, patchFile, pollJob, projectId])

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

      if (!isValidFileSize(file, maxUploadMb)) {
        setUploadingFiles(prev => [
          ...prev,
          {
            id,
            file,
            category: selectedCategory,
            progress: 0,
            status: 'error',
            error: `File is over the ${maxUploadMb} MB limit`,
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

      // Start the upload without waiting for it to be processed: every file has its own job
      // and its own poller, so files dropped later never wait for (or cancel) earlier ones.
      void uploadFile(uploadingFile)
    }
  }, [maxUploadMb, selectedCategory, uploadFile])

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
    // An upload that is still being sent is cancelled; anything else just leaves the list.
    uploadControllers.current.get(uploadId)?.abort()
    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId))
  }

  const retryFile = (upload: UploadingFile) => {
    const retry: UploadingFile = { ...upload, status: 'uploading', progress: 0, error: undefined }
    setUploadingFiles(prev => prev.map(f => (f.id === upload.id ? retry : f)))
    void uploadFile(retry)
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
                type="button"
                aria-pressed={selectedCategory === cat.value}
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
          <CardDescription>PDF, DOCX, PPTX or DOC files, up to {maxUploadMb} MB each. You can add several at once.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="group"
            aria-label="Upload area. Drop files here, or use the Browse files button."
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-12 text-center transition ${
              isDragging
                ? 'border-primary bg-primary/10'
                : 'border-border bg-white/60 hover:border-primary/35 hover:bg-white/85'
            }`}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
            <p className="text-lg font-medium mb-2">
              Drop study files here, or browse for them
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Uploading to: <Badge variant="outline">{CATEGORIES.find(c => c.value === selectedCategory)?.label}</Badge>
            </p>
            {/* The input is closed to the page; this button is the way in for keyboard and screen reader users. */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              multiple
              onChange={handleFileInput}
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
            />
            <Button type="button" onClick={() => fileInputRef.current?.click()}>
              Browse files
            </Button>
          </div>
        </CardContent>
      </Card>

      {resumedCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-white/75 p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {resumedCount} earlier upload{resumedCount === 1 ? ' is' : 's are'} still being processed.
          </span>
        </div>
      )}

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploads</CardTitle>
            <CardDescription>{uploadingFiles.length} file(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="sr-only" role="status" aria-live="polite">
              {validCount} of {uploadingFiles.length} files ready
              {invalidCount + failedCount > 0 ? `, ${invalidCount + failedCount} need attention` : ''}.
            </div>
            <div className="space-y-4">
              {uploadingFiles.map((upload) => (
                <div key={upload.id} className="rounded-xl border border-border/70 bg-white/75 p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="font-medium truncate">{upload.file.name}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(upload.id)}
                          disabled={upload.status === 'validating' || upload.status === 'processing'}
                          aria-label={
                            upload.status === 'uploading'
                              ? `Cancel upload of ${upload.file.name}`
                              : `Remove ${upload.file.name} from the list`
                          }
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
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
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm text-destructive">{upload.error}</p>
                          {!upload.materialId &&
                            isValidStudyMaterial(upload.file) &&
                            isValidFileSize(upload.file, maxUploadMb) && (
                              <Button type="button" size="sm" variant="outline" onClick={() => retryFile(upload)}>
                                Retry
                              </Button>
                            )}
                        </div>
                      ) : upload.status === 'invalid' ? (
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          Validation flagged this file: {upload.error}
                        </p>
                      ) : upload.status === 'completed' ? (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          ✓ Ready for topic extraction
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            <span>
                              {upload.status === 'uploading'
                                ? `Uploading... ${Math.round(upload.progress)}%`
                                : upload.status === 'validating'
                                ? 'Checking that this is course material...'
                                : 'Reading the file...'}
                            </span>
                          </div>
                          <Progress
                            value={upload.progress}
                            aria-label={`${upload.file.name}: ${
                              upload.status === 'uploading'
                                ? 'upload'
                                : upload.status === 'validating'
                                ? 'validation'
                                : 'processing'
                            } progress`}
                          />
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
