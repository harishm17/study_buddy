'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Lightbulb, CheckCircle, XCircle, HelpCircle, Code, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MarkdownBlock, MarkdownInline } from '@/components/ui/markdown'
import { formatLearningMarkdown } from '@/lib/utils/learning-markdown'

interface ExampleStep {
  step_number: number
  question: string
  hint: string
  answer_type: 'numeric' | 'text' | 'multiple_choice'
  correct_answer: string
  acceptable_answers?: string[]
  explanation: string
  feedback_correct: string
  feedback_incorrect: string
}

interface InteractiveExample {
  title: string
  problem_statement: string
  steps: ExampleStep[]
  key_concepts: string[]
  difficulty: string
  estimated_time_minutes: number
}

interface InteractiveExamplesViewerProps {
  examples: InteractiveExample[]
  metadata: any
  topicId: string
  userId: string
  isCompleted: boolean
}

export function InteractiveExamplesViewer({
  examples,
  metadata,
  topicId,
  userId,
  isCompleted,
}: InteractiveExamplesViewerProps) {
  const router = useRouter()
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
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

  const currentExample = examples[currentExampleIndex]
  const currentStep = currentExample.steps[currentStepIndex]
  const stepKey = `${currentExampleIndex}-${currentStepIndex}`

  const checkAnswer = (answer: string, step: ExampleStep): boolean => {
    const normalizedAnswer = answer.trim().toLowerCase()
    const normalizedCorrect = step.correct_answer.toLowerCase()

    // Check exact match
    if (normalizedAnswer === normalizedCorrect) return true

    // Check acceptable alternatives
    if (step.acceptable_answers) {
      return step.acceptable_answers.some(
        acceptable => normalizedAnswer === acceptable.toLowerCase()
      )
    }

    // For numeric answers, check with tolerance
    if (step.answer_type === 'numeric') {
      const userNum = parseFloat(answer)
      const correctNum = parseFloat(step.correct_answer)
      if (!isNaN(userNum) && !isNaN(correctNum)) {
        return Math.abs(userNum - correctNum) < 0.01
      }
    }

    return false
  }

  const handleSubmit = () => {
    const correct = checkAnswer(userAnswer, currentStep)
    setIsCorrect(correct)
    setSubmitted(true)

    if (correct) {
      setCompletedSteps(prev => new Set(prev).add(stepKey))
    }
  }

  const handleNext = () => {
    if (currentStepIndex < currentExample.steps.length - 1) {
      // Next step
      setCurrentStepIndex(prev => prev + 1)
    } else if (currentExampleIndex < examples.length - 1) {
      // Next example
      setCurrentExampleIndex(prev => prev + 1)
      setCurrentStepIndex(0)
    }

    // Reset state
    setUserAnswer('')
    setSubmitted(false)
    setIsCorrect(false)
    setShowHint(false)
  }

  const handleTryAgain = () => {
    setUserAnswer('')
    setSubmitted(false)
    setIsCorrect(false)
  }

  const jumpToExample = (index: number) => {
    setCurrentExampleIndex(index)
    setCurrentStepIndex(0)
    setUserAnswer('')
    setSubmitted(false)
    setIsCorrect(false)
    setShowHint(false)
  }

  const jumpToStep = (stepIndex: number) => {
    setCurrentStepIndex(stepIndex)
    setUserAnswer('')
    setSubmitted(false)
    setIsCorrect(false)
    setShowHint(false)
  }

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

  const handlePracticeMore = async () => {
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
          contentType: 'interactive_examples',
          preferences,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate more practice')

      const data = await response.json()

      // Poll for job completion
      await pollJobStatus(data.jobId)

      // Reload page to show new examples
      if (!isMountedRef.current) return
      router.refresh()
    } catch (error) {
      console.error('Error generating more practice:', error)
      if (!isMountedRef.current) return
      setError('Failed to generate more practice')
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

  const progressPercentage =
    (completedSteps.size / (examples.reduce((acc, ex) => acc + ex.steps.length, 0))) * 100

  const isLastStep =
    currentExampleIndex === examples.length - 1 &&
    currentStepIndex === currentExample.steps.length - 1

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
                <HelpCircle className="h-6 w-6 text-primary" />
                <CardTitle>Interactive Practice</CardTitle>
                {isCompleted && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Completed
                  </Badge>
                )}
              </div>
              <CardDescription>
                {examples.length} practice problem{examples.length !== 1 ? 's' : ''} - solve step by step
              </CardDescription>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handlePracticeMore}
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
                    Add Practice
                  </>
                )}
              </Button>

              {!isCompleted && progressPercentage >= 80 && (
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
              placeholder="e.g., conceptual reasoning, stack frames, pointer subterfuge"
              className="mt-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Leave blank to cover a broad mix of concepts. New steps will be appended.
            </p>
          </div>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{Math.round(progressPercentage)}%</span>
            </div>
            <div className="w-full overflow-hidden rounded-full bg-secondary/80 h-2.5">
              <div
                className="h-full bg-gradient-to-r from-primary to-cyan-400 transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {examples.length > 1 && (
        <Card>
          <CardContent className="pt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Practice Set
            </div>
            <div className="flex flex-wrap gap-2">
              {examples.map((example, index) => (
                <Button
                  key={`example-${index}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => jumpToExample(index)}
                  className={currentExampleIndex === index
                    ? 'border border-primary/80 bg-primary text-primary-foreground hover:bg-primary/95 hover:text-primary-foreground [&_*]:text-primary-foreground'
                    : 'border border-border/70 bg-white/80 text-foreground hover:border-primary/35 hover:bg-white'
                  }
                >
                  Example {index + 1}
                  <Badge
                    className={`ml-2 ${
                      currentExampleIndex === index
                        ? 'border-primary-foreground/35 bg-primary-foreground/15 text-primary-foreground'
                        : getDifficultyColor(example.difficulty)
                    }`}
                  >
                    {example.difficulty}
                  </Badge>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Example */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <span>Example {currentExampleIndex + 1} of {examples.length}</span>
                <span>•</span>
                <span>~{currentExample.estimated_time_minutes} min</span>
              </div>
              <CardTitle className="text-xl mb-2">
                <MarkdownInline content={currentExample.title} />
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge className={getDifficultyColor(currentExample.difficulty)}>
                  {currentExample.difficulty}
                </Badge>
                {currentExample.key_concepts.map((concept, i) => (
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
            <MarkdownBlock content={formatLearningMarkdown(currentExample.problem_statement)} variant="compact" />
          </div>
        </CardContent>
      </Card>

      {/* Current Step */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Badge variant="outline" className="border-primary/40 bg-primary/10 font-semibold text-primary">
              Step {currentStep.step_number} of {currentExample.steps.length}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {currentStep.answer_type.replace('_', ' ')}
            </Badge>
          </div>
          <div className="text-lg font-semibold leading-snug">
            <MarkdownBlock content={formatLearningMarkdown(currentStep.question)} variant="compact" />
          </div>
          <div className="flex flex-wrap gap-2">
            {currentExample.steps.map((step, idx) => {
              const stepDone = completedSteps.has(`${currentExampleIndex}-${idx}`)
              const isActive = idx === currentStepIndex
              return (
                <Button
                  key={`step-chip-${step.step_number}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => jumpToStep(idx)}
                  className={`h-8 rounded-full border text-xs ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-[0_10px_22px_-14px_rgba(14,116,144,0.95)] [&_*]:text-primary-foreground'
                      : stepDone
                        ? 'border-green-300/80 bg-green-50 text-green-700 hover:border-green-400 hover:bg-green-100'
                        : 'border-border/70 bg-white/80 text-muted-foreground hover:border-primary/35 hover:text-foreground'
                  }`}
                >
                  Step {step.step_number}
                </Button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Answer Input */}
          {!submitted && (
            <div className="space-y-3">
              {currentStep.answer_type === 'numeric' ? (
                <Input
                  type="number"
                  placeholder="Enter your answer..."
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && userAnswer.trim()) {
                      handleSubmit()
                    }
                  }}
                  className="text-lg"
                  autoFocus
                />
              ) : (
                <textarea
                  placeholder="Enter your answer..."
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className="min-h-[120px] w-full rounded-xl border border-border/70 bg-white/80 p-3 text-base"
                  autoFocus
                />
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={handleSubmit}
                  disabled={!userAnswer.trim()}
                  className="flex-1"
                  size="lg"
                >
                  Submit Answer
                </Button>
                <Button
                  onClick={() => setShowHint(!showHint)}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  <Lightbulb className="h-4 w-4 mr-2" />
                  {showHint ? 'Hide' : 'Show'} Hint
                </Button>
              </div>

              {/* Hint */}
              {showHint && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg">
                  <div className="flex gap-3">
                    <Lightbulb className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <MarkdownBlock content={formatLearningMarkdown(currentStep.hint)} variant="compact" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Feedback */}
          {submitted && (
            <div className="space-y-4">
              {/* Result Banner */}
              <div
                className={`p-4 rounded-lg border-2 ${
                  isCorrect
                    ? 'bg-green-500/10 border-green-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                <div className="flex gap-3">
                  {isCorrect ? (
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold mb-1">
                      {isCorrect ? 'Correct!' : 'Not quite right'}
                    </p>
                    <div className="text-sm">
                      <MarkdownInline
                        content={
                          isCorrect ? currentStep.feedback_correct : currentStep.feedback_incorrect
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Explanation */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="font-medium mb-2">Explanation:</p>
                <MarkdownBlock
                  content={formatLearningMarkdown(currentStep.explanation)}
                  variant="compact"
                  className="text-muted-foreground"
                />
                <div className="bg-accent/50 p-3 rounded">
                  <p className="text-sm font-medium mb-1">Correct answer:</p>
                  <MarkdownBlock content={formatLearningMarkdown(currentStep.correct_answer)} variant="compact" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {!isCorrect && (
                  <Button onClick={handleTryAgain} variant="outline" className="flex-1">
                    Try Again
                  </Button>
                )}
                {(isCorrect || !isCorrect) && !isLastStep && (
                  <Button onClick={handleNext} className="flex-1">
                    Next Step
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
                {isCorrect && isLastStep && (
                  <Button onClick={handleMarkComplete} className="flex-1">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete All Examples
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Study Tips */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Code className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Practice Tips</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Try to solve each step before using the hint</li>
                <li>If you get stuck, use the hint to guide your thinking</li>
                <li>Read the explanations carefully, even when you get it right</li>
                <li>Don&apos;t worry about mistakes - they&apos;re part of learning!</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
