'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle, Lightbulb, Code, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
  userId,
  isCompleted,
}: SolvedExamplesViewerProps) {
  const [expandedExample, setExpandedExample] = useState<number>(0)
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const [markingComplete, setMarkingComplete] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const toggleStep = (exampleIndex: number, stepNumber: number) => {
    const key = `${exampleIndex}-${stepNumber}`
    setExpandedSteps(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleMarkComplete = async () => {
    try {
      setMarkingComplete(true)

      const response = await fetch(`/api/topics/${topicId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examplesCompleted: true,
        }),
      })

      if (!response.ok) throw new Error('Failed to update progress')

      window.location.reload()
    } catch (error) {
      console.error('Error marking complete:', error)
      alert('Failed to update progress')
    } finally {
      setMarkingComplete(false)
    }
  }

  const handleGenerateMore = async () => {
    try {
      setRegenerating(true)

      const response = await fetch(`/api/topics/${topicId}/regenerate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'solved_examples',
          preferences: {
            count: metadata?.count || 3,
            difficulty_level: metadata?.difficulty_level || 'medium',
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to generate more examples')

      const data = await response.json()

      // Poll for job completion
      await pollJobStatus(data.jobId)

      // Reload page to show new examples
      window.location.reload()
    } catch (error) {
      console.error('Error generating more examples:', error)
      alert('Failed to generate more examples')
    } finally {
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

          setTimeout(poll, 2000)
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
      <Card>
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
              <Button
                onClick={handleGenerateMore}
                disabled={regenerating}
                variant="outline"
                size="lg"
              >
                {regenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    More Examples
                  </>
                )}
              </Button>

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
      </Card>

      {/* Example Selector */}
      {examples.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {examples.map((example, index) => (
            <Button
              key={index}
              variant={expandedExample === index ? 'default' : 'outline'}
              onClick={() => setExpandedExample(index)}
              className="flex items-center gap-2"
            >
              Example {index + 1}
              <Badge className={getDifficultyColor(example.difficulty)}>
                {example.difficulty}
              </Badge>
            </Button>
          ))}
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
                  <CardTitle className="text-xl mb-2">{example.title}</CardTitle>
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
                <p className="font-medium mb-2">Problem:</p>
                <p className="text-foreground">{example.problem_statement}</p>
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
              const key = `${exampleIndex}-${step.step_number}`
              const isExpanded = expandedSteps[key] !== false // Default to expanded

              return (
                <Card key={step.step_number}>
                  <CardHeader
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => toggleStep(exampleIndex, step.step_number)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono">
                            Step {step.step_number}
                          </Badge>
                          <CardTitle className="text-base">
                            {step.description}
                          </CardTitle>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-4">
                      {/* Work */}
                      <div className="bg-accent/30 p-4 rounded-lg font-mono text-sm">
                        {step.work}
                      </div>

                      {/* Explanation */}
                      <div className="flex gap-3 p-4 bg-muted/50 rounded-lg">
                        <Lightbulb className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-muted-foreground">
                          {step.explanation}
                        </p>
                      </div>
                    </CardContent>
                  )}
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
                <p className="font-semibold text-lg">{example.final_answer}</p>
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
