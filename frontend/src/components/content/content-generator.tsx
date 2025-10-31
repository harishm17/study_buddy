'use client'

import { useState, useEffect } from 'react'
import { Loader2, FileText, Code, HelpCircle, ClipboardList, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Topic {
  id: string
  name: string
  description: string | null
}

interface ContentGeneratorProps {
  topic: Topic
}

interface ContentStatus {
  section_notes?: boolean
  solved_examples?: boolean
  interactive_examples?: boolean
  topic_quiz?: boolean
}

interface GenerationConfig {
  contentType: string
  preferences: Record<string, any>
}

export function ContentGenerator({ topic }: ContentGeneratorProps) {
  const [contentStatus, setContentStatus] = useState<ContentStatus>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)

  useEffect(() => {
    checkExistingContent()
  }, [topic.id])

  const checkExistingContent = async () => {
    try {
      const response = await fetch(`/api/topics/${topic.id}/content`)
      if (!response.ok) throw new Error('Failed to fetch content')

      const data = await response.json()
      const status: ContentStatus = {}

      data.content.forEach((item: any) => {
        status[item.contentType as keyof ContentStatus] = true
      })

      setContentStatus(status)
    } catch (error) {
      console.error('Error fetching content:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateContent = async (config: GenerationConfig) => {
    try {
      setGenerating(config.contentType)

      const response = await fetch(`/api/topics/${topic.id}/generate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate content')
      }

      const data = await response.json()
      const jobId = data.jobId

      // Poll for job completion
      await pollJobStatus(jobId)

      // Refresh content status
      await checkExistingContent()
    } catch (error) {
      console.error('Error generating content:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate content')
    } finally {
      setGenerating(null)
    }
  }

  const pollJobStatus = async (jobId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const response = await fetch(`/api/jobs/${jobId}`)
          if (!response.ok) throw new Error('Failed to fetch job status')

          const job = await response.json()

          if (job.status === 'completed') {
            resolve()
            return
          }

          if (job.status === 'failed') {
            reject(new Error(job.errorMessage || 'Content generation failed'))
            return
          }

          // Continue polling
          setTimeout(poll, 2000)
        } catch (error) {
          reject(error)
        }
      }

      poll()
    })
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
      <Card>
        <CardHeader>
          <CardTitle>Generate Content</CardTitle>
          <CardDescription>
            AI-powered content generation for {topic.name}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Content Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contentTypes.map((contentType) => {
          const Icon = contentType.icon
          const exists = contentStatus[contentType.type as keyof ContentStatus]
          const isGenerating = generating === contentType.type

          return (
            <Card key={contentType.type} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-primary/10 rounded-lg">
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
                <Button
                  onClick={() => handleGenerateContent({
                    contentType: contentType.type,
                    preferences: contentType.defaultPreferences,
                  })}
                  disabled={isGenerating || generating !== null}
                  className="w-full"
                  variant={exists ? 'outline' : 'default'}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : exists ? (
                    'Regenerate'
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Sparkles className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">AI-Powered Generation</p>
              <p>
                Content is generated using advanced AI by analyzing your uploaded materials.
                Each type of content is tailored to help you learn effectively.
                You can regenerate content at any time to get fresh variations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
