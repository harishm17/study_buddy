'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, FileText, Code, HelpCircle, ClipboardList, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { useJobPolling } from '@/hooks/useJobPolling'

interface Topic {
  id: string
  name: string
  description: string | null
}

interface ContentGeneratorProps {
  topic: Topic
  onContentUpdated?: (content: GeneratedContentItem[]) => void
  onOpenContentTab?: (contentType: string) => void
}

interface ContentStatus {
  section_notes?: boolean
  solved_examples?: boolean
  interactive_examples?: boolean
  topic_quiz?: boolean
}

interface GeneratedContentItem {
  id: string
  contentType: string
  contentData: any
  metadata: any
}

interface GenerationConfig {
  contentType: string
  preferences: Record<string, any>
}

type BatchJobStatus = {
  contentType: string
  jobId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progressPercent: number
  stage?: string | null
  errorMessage?: string | null
}

export function ContentGenerator({ topic, onContentUpdated, onOpenContentTab }: ContentGeneratorProps) {
  const [contentStatus, setContentStatus] = useState<ContentStatus>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [batchJobs, setBatchJobs] = useState<BatchJobStatus[] | null>(null)
  const [jobStatusText, setJobStatusText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef(true)
  const batchPollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { pollJob, stopPolling } = useJobPolling({ timeoutMs: 180_000 })

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      stopPolling()
      if (batchPollingRef.current) {
        clearInterval(batchPollingRef.current)
        batchPollingRef.current = null
      }
    }
  }, [stopPolling])

  const checkExistingContent = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`/api/topics/${topic.id}/content`)
      if (!response.ok) throw new Error('Failed to fetch content')

      const data = await response.json()
      const status: ContentStatus = {}
      const contentItems: GeneratedContentItem[] = Array.isArray(data.content) ? data.content : []

      if (contentItems.length > 0) {
        contentItems.forEach((item: GeneratedContentItem) => {
          status[item.contentType as keyof ContentStatus] = true
        })
      }

      if (!isMountedRef.current) return true
      setContentStatus(status)
      onContentUpdated?.(contentItems)
    } catch (error) {
      console.error('Error fetching content:', error)
      if (!isMountedRef.current) return true
      setError('Unable to load content status.')
    } finally {
      if (!isMountedRef.current) return true
      setLoading(false)
    }
  }, [topic.id, onContentUpdated])

  useEffect(() => {
    checkExistingContent()
  }, [checkExistingContent])

  const contentTypeLabels: Record<string, string> = {
    section_notes: 'Section Notes',
    solved_examples: 'Solved Examples',
    interactive_examples: 'Interactive Examples',
    topic_quiz: 'Topic Quiz',
  }

  const parseGenerationError = async (response: Response) => {
    const error = await response.json().catch(() => ({}))
    if (typeof error?.error === 'string') return error.error
    return error?.error?.message || 'Failed to generate content'
  }

  const enqueueContentJob = async (config: GenerationConfig, regenerate = false) => {
    const endpoint = regenerate ? 'regenerate-content' : 'generate-content'
    const response = await fetch(`/api/topics/${topic.id}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })

    if (!response.ok) {
      throw new Error(await parseGenerationError(response))
    }

    const data = await response.json()
    if (!data?.jobId) {
      throw new Error('Failed to start content generation')
    }

    return data.jobId as string
  }

  const pollBatchJobs = async (jobs: BatchJobStatus[]) => {
    if (batchPollingRef.current) {
      clearInterval(batchPollingRef.current)
      batchPollingRef.current = null
    }

    setBatchJobs(jobs)
    setBatchProgress({ current: 0, total: jobs.length })

    const pollOnce = async (): Promise<boolean> => {
      if (!isMountedRef.current) return true

      const results = await Promise.allSettled(
        jobs.map(async (job) => {
          const response = await fetch(`/api/jobs/${job.jobId}`)
          if (!response.ok) {
            throw new Error(`Failed to fetch job ${job.jobId}`)
          }
          return response.json()
        })
      )

      const nextJobs = jobs.map((job, index) => {
        const result = results[index]
        if (result.status !== 'fulfilled') {
          return job
        }
        const payload = result.value as Record<string, any>
        const status = String(payload.status || 'queued') as BatchJobStatus['status']
        return {
          ...job,
          status,
          progressPercent: Number(payload.progressPercent || 0),
          stage: payload.stage ?? null,
          errorMessage: payload.errorMessage ?? null,
        }
      })

      if (!isMountedRef.current) return true

      setBatchJobs(nextJobs)
      jobs = nextJobs

      const completedCount = nextJobs.filter((job) =>
        job.status === 'completed' || job.status === 'failed'
      ).length
      setBatchProgress({ current: completedCount, total: nextJobs.length })

      const allDone = completedCount === nextJobs.length
      if (allDone && batchPollingRef.current) {
        clearInterval(batchPollingRef.current)
        batchPollingRef.current = null
      }
      return allDone
    }

    const done = await pollOnce()
    if (done) {
      return
    }

    batchPollingRef.current = setInterval(async () => {
      const finished = await pollOnce()
      if (finished && batchPollingRef.current) {
        clearInterval(batchPollingRef.current)
        batchPollingRef.current = null
      }
    }, 1500)
  }

  const pollContentJob = async (
    jobId: string,
    contentType: string,
    batchIndex?: number,
    batchTotal?: number
  ) => {
    const label = contentTypeLabels[contentType] || 'content'
    const hasBatch = Number.isFinite(batchIndex) && Number.isFinite(batchTotal)
    const batchLabel = hasBatch ? ` (${batchIndex}/${batchTotal})` : ''

    const pollResult = await pollJob(jobId, (job) => {
      const stage = job.stage ? `${job.stage}` : 'processing'
      const progress = Number.isFinite(job.progressPercent)
        ? `${Math.max(0, Math.floor(job.progressPercent))}%`
        : ''
      setJobStatusText(`Generating ${label}${batchLabel} (${stage}${progress ? `, ${progress}` : ''})`)
    })

    if (pollResult.state !== 'completed') {
      throw new Error(pollResult.error || 'Content generation failed')
    }
  }

  const generateContent = async (
    config: GenerationConfig,
    regenerate = false,
    openGeneratedTab = true
  ) => {
    try {
      stopPolling()
      setGenerating(config.contentType)
      setError(null)
      setJobStatusText(`Starting ${contentTypeLabels[config.contentType] || 'content'} generation...`)

      const jobId = await enqueueContentJob(config, regenerate)
      await pollContentJob(jobId, config.contentType)

      // Refresh content status
      await checkExistingContent()
      setJobStatusText(`${contentTypeLabels[config.contentType] || 'Content'} is ready.`)
      if (!regenerate && openGeneratedTab) {
        onOpenContentTab?.(config.contentType)
      }
      return true
    } catch (error) {
      console.error('Error generating content:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate content')
      return false
    } finally {
      setGenerating(null)
      if (!isGeneratingAll) {
        setBatchProgress(null)
      }
    }
  }

  const handleGenerateContent = async (config: GenerationConfig, regenerate = false) => {
    await generateContent(config, regenerate, true)
  }

  const contentTypes = [
    {
      type: 'section_notes',
      title: 'Section Notes',
      description: 'Comprehensive study notes synthesized from all materials',
      icon: FileText,
      defaultPreferences: {
        detail_level: 'comprehensive',
        include_examples: true,
      },
    },
    {
      type: 'solved_examples',
      title: 'Solved Examples',
      description: 'Step-by-step worked examples with detailed explanations',
      icon: Code,
      defaultPreferences: {
        count: 3,
        difficulty_level: 'medium',
      },
    },
    {
      type: 'interactive_examples',
      title: 'Interactive Examples',
      description: 'Practice problems you solve step-by-step with hints',
      icon: HelpCircle,
      defaultPreferences: {
        count: 3,
        difficulty_level: 'medium',
      },
    },
    {
      type: 'topic_quiz',
      title: 'Topic Quiz',
      description: 'Quiz to test your understanding of this topic',
      icon: ClipboardList,
      defaultPreferences: {
        question_count: 10,
        difficulty_level: 'medium',
      },
    },
  ]

  const missingContentTypes = contentTypes.filter(
    (contentType) => !contentStatus[contentType.type as keyof ContentStatus]
  )
  const hasMissingContent = missingContentTypes.length > 0

  const runBatchGeneration = async (targets: typeof contentTypes, regenerate: boolean) => {
    if (targets.length === 0) return
    setError(null)
    setIsGeneratingAll(true)
    setGenerating(null)
    setBatchProgress({ current: 0, total: targets.length })
    const actionLabel = regenerate ? 'Regenerating' : 'Generating'
    setJobStatusText(`Starting ${actionLabel.toLowerCase()} ${targets.length} content block(s)...`)
    let failedCount = 0

    try {
      stopPolling()
      const enqueueResults = await Promise.allSettled(
        targets.map(async (contentType) => {
          const jobId = await enqueueContentJob({
            contentType: contentType.type,
            preferences: contentType.defaultPreferences,
          }, regenerate)
          return { contentType: contentType.type, jobId }
        })
      )

      const jobs = enqueueResults
        .filter((result): result is PromiseFulfilledResult<{ contentType: string; jobId: string }> => result.status === 'fulfilled')
        .map(result => result.value)
      failedCount = enqueueResults.length - jobs.length

      if (jobs.length === 0) {
        throw new Error('Unable to start content generation jobs')
      }

      if (failedCount > 0) {
        setJobStatusText(`Started ${jobs.length} content job(s). ${failedCount} failed to start.`)
      } else {
        setJobStatusText(`Queued ${jobs.length} content job(s). Monitoring progress...`)
      }

      const initialJobs: BatchJobStatus[] = jobs.map((job) => ({
        contentType: job.contentType,
        jobId: job.jobId,
        status: 'queued',
        progressPercent: 0,
        stage: null,
        errorMessage: null,
      }))

      await pollBatchJobs(initialJobs)

      // Wait for all jobs to complete.
      while (batchPollingRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 400))
      }

      await checkExistingContent()
      setJobStatusText(
        failedCount > 0
          ? `All started content is ready. ${failedCount} job(s) failed to start.`
          : 'All selected content is ready.'
      )
    } catch (error) {
      console.error('Error generating content:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate content')
    } finally {
      setIsGeneratingAll(false)
      setGenerating(null)
      setBatchProgress(null)
      setBatchJobs(null)
    }
  }

  const handleGenerateAllMissing = async () => {
    await runBatchGeneration(missingContentTypes, false)
  }

  const handleRegenerateAll = async () => {
    await runBatchGeneration(contentTypes, true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="items-center pb-3 text-center">
          <CardTitle>Generate Content</CardTitle>
          <CardDescription className="mx-auto max-w-2xl">
            AI-powered content generation for {topic.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 pb-5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">
                  {hasMissingContent
                    ? `Missing ${missingContentTypes.length} core block${missingContentTypes.length === 1 ? '' : 's'}. Generate them together to start learning faster.`
                    : 'All core blocks are generated. You can refresh all content for a fresh variation any time.'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Use the per-card actions when you only want one block.
                </p>
              </div>
              {(() => {
                const label = hasMissingContent
                  ? `Generate Missing (${missingContentTypes.length})`
                  : `Refresh All (${contentTypes.length})`
                const action = hasMissingContent ? handleGenerateAllMissing : handleRegenerateAll

                return (
                  <Button
                    onClick={action}
                    disabled={isGeneratingAll || generating !== null}
                    variant={hasMissingContent ? 'default' : 'outline'}
                  >
                    {isGeneratingAll && batchProgress ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating {batchProgress.current}/{batchProgress.total}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {label}
                      </>
                    )}
                  </Button>
                )
              })()}
            </div>
          </div>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {jobStatusText && !error && (
        <Alert>
          <AlertDescription>{jobStatusText}</AlertDescription>
        </Alert>
      )}
      {batchJobs && batchJobs.length > 0 && (
        <Card className="border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Batch Progress</CardTitle>
            <CardDescription>Running all content jobs in the background.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {batchJobs.map((job) => (
              <div
                key={job.jobId}
                className="rounded-xl border border-border/60 bg-white/70 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{contentTypeLabels[job.contentType] || job.contentType}</div>
                  <Badge variant={job.status === 'completed' ? 'secondary' : 'outline'} className="capitalize">
                    {job.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  {job.stage || 'queued'}
                </div>
                <div className="mt-2">
                  <Progress value={job.progressPercent} className="h-2" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Content Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contentTypes.map((contentType) => {
          const Icon = contentType.icon
          const exists = contentStatus[contentType.type as keyof ContentStatus]
          const isGenerating = generating === contentType.type

          return (
            <Card key={contentType.type} className="relative transition hover:-translate-y-0.5 hover:border-primary/30">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="rounded-xl border border-primary/15 bg-primary/10 p-2">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{contentType.title}</CardTitle>
                      {exists && (
                        <Badge variant="secondary" className="text-xs">
                          Generated
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-sm">
                      {contentType.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!exists && (
                  <Button
                    onClick={() => handleGenerateContent({
                      contentType: contentType.type,
                      preferences: contentType.defaultPreferences,
                    }, false)}
                    disabled={isGenerating || generating !== null || isGeneratingAll}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate
                      </>
                    )}
                  </Button>
                )}
                {exists && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => onOpenContentTab?.(contentType.type)}
                      disabled={isGenerating || generating !== null || isGeneratingAll}
                      className="flex-1"
                      variant="outline"
                    >
                      Open
                    </Button>
                    <Button
                      onClick={() => handleGenerateContent({
                        contentType: contentType.type,
                        preferences: contentType.defaultPreferences,
                      }, true)}
                      disabled={isGenerating || generating !== null || isGeneratingAll}
                      variant="ghost"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        'Refresh'
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

    </div>
  )
}
