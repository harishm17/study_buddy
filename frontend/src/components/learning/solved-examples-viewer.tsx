'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Lightbulb, Code, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { MarkdownBlock, MarkdownInline } from '@/components/ui/markdown'
import { formatLearningMarkdown } from '@/lib/utils/learning-markdown'

interface SolutionStep {
  step_number: number
  description: string
  work: string
  explanation: string
}

interface SolvedExample {
  title: string
  problem_statement: string
  solution_steps: SolutionStep[]
  final_answer: string
  key_concepts: string[]
  difficulty: string
}

interface SolvedExamplesViewerProps {
  examples: SolvedExample[]
  metadata: any
  topicId: string
  userId: string
  isCompleted: boolean
}

export function SolvedExamplesViewer({
  examples,
  metadata,
  topicId,
  isCompleted,
}: SolvedExamplesViewerProps) {
  const router = useRouter()
  const [expandedExample, setExpandedExample] = useState<number>(0)
  const [markingComplete, setMarkingComplete] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusText, setFocusText] = useState('')
  const isMountedRef = useRef(true)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
  }, [])

  const handleMarkComplete = async () => {
    try {
      setMarkingComplete(true)
      setError(null)

      const response = await fetch(`/api/topics/${topicId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examplesCompleted: true,
        }),
      })

      if (!response.ok) throw new Error('Failed to update progress')

      if (!isMountedRef.current) return
      router.refresh()
    } catch (error) {
      console.error('Error marking complete:', error)
      if (!isMountedRef.current) return
      setError('Failed to update progress')
    } finally {
      if (!isMountedRef.current) return
      setMarkingComplete(false)
    }
  }

  const handleGenerateMore = async () => {
    try {
      setRegenerating(true)
      setError(null)

      const focus = focusText.trim()
      const preferences: Record<string, any> = {
        count: metadata?.count || 3,
        difficulty_level: metadata?.difficulty_level || 'medium',
        append: true,
      }
      if (focus) {
        preferences.focus = focus
      }

      const response = await fetch(`/api/topics/${topicId}/regenerate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'solved_examples',
          preferences,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate more examples')

      const data = await response.json()

      // Poll for job completion
      await pollJobStatus(data.jobId)

      // Reload page to show new examples
      if (!isMountedRef.current) return
      router.refresh()
    } catch (error) {
      console.error('Error generating more examples:', error)
      if (!isMountedRef.current) return
      setError('Failed to generate more examples')
    } finally {
      if (!isMountedRef.current) return
      setRegenerating(false)
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

          pollTimeoutRef.current = setTimeout(poll, 2000)
        } catch (error) {
          reject(error)
        }
      }

      poll()
    })
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-500/10 text-green-700 dark:text-green-400'
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
      case 'hard':
        return 'bg-red-500/10 text-red-700 dark:text-red-400'
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Code className="h-6 w-6 text-primary" />
                <CardTitle>Solved Examples</CardTitle>
                {isCompleted && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Completed
                  </Badge>
                )}
              </div>
              <CardDescription>
                {examples.length} worked example{examples.length !== 1 ? 's' : ''} with step-by-step solutions
              </CardDescription>
            </div>

            <div className="flex gap-2">
              {!isCompleted && (
                <Button
                  onClick={handleMarkComplete}
                  disabled={markingComplete}
                  size="lg"
                >
                  {markingComplete ? 'Marking...' : 'Mark as Complete'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-xl border border-border/60 bg-white/70 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Focus (optional)
            </div>
            <Input
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
              placeholder="e.g., more conceptual problems, limiting reagent, practice offsets"
              className="mt-2"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Leave blank to cover a broad mix of concepts. New examples will be appended.
              </p>
              <Button
                onClick={handleGenerateMore}
                disabled={regenerating}
                variant="outline"
                size="sm"
              >
                {regenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Add Examples
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Example Selector */}
      {examples.length > 1 && (
        <div className="rounded-2xl border border-border/70 bg-white/70 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Choose Example
          </div>
          <div className="flex flex-wrap gap-2">
          {examples.map((example, index) => (
                <Button
                  key={index}
                  variant="outline"
                  onClick={() => setExpandedExample(index)}
                  className={`flex items-center gap-2 rounded-xl border ${
                    expandedExample === index
                      ? 'border-primary/80 bg-primary text-primary-foreground hover:bg-primary/95 hover:text-primary-foreground [&_*]:text-primary-foreground'
                      : 'border-border/70 bg-white/80 text-foreground hover:border-primary/35 hover:bg-white'
                  }`}
                >
                  Example {index + 1}
                  <Badge
                    className={expandedExample === index
                      ? 'border-primary-foreground/35 bg-primary-foreground/15 text-primary-foreground'
                      : getDifficultyColor(example.difficulty)
                    }
                  >
                    {example.difficulty}
                  </Badge>
                </Button>
          ))}
          </div>
        </div>
      )}

      {/* Example Content */}
      {examples.map((example, exampleIndex) => (
        <div
          key={exampleIndex}
          className={exampleIndex === expandedExample ? 'block' : 'hidden'}
        >
          {/* Problem Statement */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-xl mb-2">
                    <MarkdownInline content={example.title} />
                  </CardTitle>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge className={getDifficultyColor(example.difficulty)}>
                      {example.difficulty}
                    </Badge>
                    {example.key_concepts.map((concept, i) => (
                      <Badge key={i} variant="outline">
                        {concept}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="font-medium mb-2">Problem Statement</p>
                <MarkdownBlock
                  content={formatLearningMarkdown(example.problem_statement)}
                  variant="compact"
                />
              </div>
            </CardContent>
          </Card>

          {/* Solution Steps */}
          <div className="space-y-3 mt-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Step-by-Step Solution
            </h3>

            {example.solution_steps.map((step) => {
              return (
                <Card
                  id={`example-${exampleIndex}-step-${step.step_number}`}
                  key={step.step_number}
                  className="border border-primary/10"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-sm font-semibold text-primary">
                        {step.step_number}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Step {step.step_number}
                        </div>
                        <CardTitle className="text-base leading-snug mt-1">
                          <MarkdownInline content={step.description} />
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-xl border border-amber-200/50 bg-amber-50/60 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700/80 mb-2">
                        Working Out
                      </div>
                      <MarkdownBlock
                        content={formatLearningMarkdown(step.work)}
                        variant="compact"
                      />
                    </div>
                    <div className="flex gap-3 rounded-xl border border-border/60 bg-white/70 p-4">
                      <Lightbulb className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
                          Reasoning
                        </div>
                        <MarkdownBlock
                          content={formatLearningMarkdown(step.explanation)}
                          variant="compact"
                          className="text-muted-foreground"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Final Answer */}
          <Card className="mt-4 border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                Final Answer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-primary/5 p-4 rounded-lg">
                <MarkdownBlock
                  content={formatLearningMarkdown(example.final_answer)}
                  variant="compact"
                  className="text-base font-semibold leading-7 text-foreground"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ))}

      {/* Study Tips */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Lightbulb className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">How to Use Solved Examples</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Read the problem carefully and try to think about how you would approach it</li>
                <li>Go through each step and understand the reasoning</li>
                <li>Pay attention to the explanations - they highlight key principles</li>
                <li>After studying, try to solve similar problems on your own</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
