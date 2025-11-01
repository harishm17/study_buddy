'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatBytes, isValidPDF, isValidFileSize } from '@/lib/utils'

interface MaterialUploadProps {
  projectId: string
}

type MaterialCategory = 'lecture_notes' | 'sample_exams' | 'book_chapters'

interface UploadingFile {
  file: File
  category: MaterialCategory
  progress: number
  status: 'uploading' | 'validating' | 'completed' | 'error'
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
  }, [selectedCategory])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
    // Reset input
    e.target.value = ''
  }, [selectedCategory])

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      // Validate file
      if (!isValidPDF(file)) {
        alert(`${file.name} is not a valid PDF file`)
        continue
      }

      if (!isValidFileSize(file, 10)) {
        alert(`${file.name} exceeds 10MB limit`)
        continue
      }

      // Add to uploading list
      const uploadingFile: UploadingFile = {
        file,
        category: selectedCategory,
        progress: 0,
        status: 'uploading',
      }

      setUploadingFiles(prev => [...prev, uploadingFile])

      // Start upload
      await uploadFile(uploadingFile)
    }
  }

  const uploadFile = async (uploadingFile: UploadingFile) => {
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
        throw new Error('Upload failed')
      }

      const data = await response.json()

      // Update status to validating
      setUploadingFiles(prev =>
        prev.map(f =>
          f.file === uploadingFile.file
            ? { ...f, status: 'validating', progress: 50, materialId: data.material.id, jobId: data.jobId }
            : f
        )
      )

      // Poll for validation status
      await pollJobStatus(uploadingFile, data.jobId)

    } catch (error) {
      console.error('Upload error:', error)
      setUploadingFiles(prev =>
        prev.map(f =>
          f.file === uploadingFile.file
            ? { ...f, status: 'error', error: 'Upload failed' }
            : f
        )
      )
    }
  }

  const pollJobStatus = async (uploadingFile: UploadingFile, jobId: string) => {
    const maxAttempts = 60 // 60 seconds max
    let attempts = 0

    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`)
        if (!response.ok) throw new Error('Failed to fetch job status')

        const job = await response.json()

        if (job.status === 'completed') {
          setUploadingFiles(prev =>
            prev.map(f =>
              f.file === uploadingFile.file
                ? { ...f, status: 'completed', progress: 100 }
                : f
            )
          )
          // Optionally navigate back to project page after successful upload
          // router.push(`/projects/${projectId}`)
          return
        }

        if (job.status === 'failed') {
          setUploadingFiles(prev =>
            prev.map(f =>
              f.file === uploadingFile.file
                ? { ...f, status: 'error', error: job.errorMessage || 'Validation failed' }
                : f
            )
          )
          return
        }

        // Update progress
        setUploadingFiles(prev =>
          prev.map(f =>
            f.file === uploadingFile.file
              ? { ...f, progress: 50 + (job.progressPercent / 2) }
              : f
          )
        )

        // Continue polling
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000)
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }

    poll()
  }

  const removeFile = (file: File) => {
    setUploadingFiles(prev => prev.filter(f => f.file !== file))
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
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
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
          <CardDescription>PDF files only, max 10MB each</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">
              Drop PDF files here or click to browse
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Uploading to: <Badge variant="outline">{CATEGORIES.find(c => c.value === selectedCategory)?.label}</Badge>
            </p>
            <input
              type="file"
              accept=".pdf,application/pdf"
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
              {uploadingFiles.map((upload, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="font-medium truncate">{upload.file.name}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(upload.file)}
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}
