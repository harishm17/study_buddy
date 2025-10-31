'use client'

import { useState } from 'react'
import { ChevronRight, Lightbulb, CheckCircle, XCircle, HelpCircle, Code, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

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
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [markingComplete, setMarkingComplete] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

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

  const handlePracticeMore = async () => {
    try {
      setRegenerating(true)

      const response = await fetch(`/api/topics/${topicId}/regenerate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'interactive_examples',
          preferences: {
            count: metadata?.count || 3,
            difficulty_level: metadata?.difficulty_level || 'medium',
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to generate more practice')

      const data = await response.json()

      // Poll for job completion
      await pollJobStatus(data.jobId)

      // Reload page to show new examples
      window.location.reload()
    } catch (error) {
      console.error('Error generating more practice:', error)
      alert('Failed to generate more practice')
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
      <Card>
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
                    Practice More
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
      </Card>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{Math.round(progressPercentage)}%</span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
              <CardTitle className="text-xl mb-2">{currentExample.title}</CardTitle>
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
            <p>{currentExample.problem_statement}</p>
          </div>
        </CardContent>
      </Card>

      {/* Current Step */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono">
              Step {currentStep.step_number} of {currentExample.steps.length}
            </Badge>
            <CardTitle className="text-lg">{currentStep.question}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Answer Input */}
          {!submitted && (
            <div className="space-y-3">
              <Input
                type={currentStep.answer_type === 'numeric' ? 'number' : 'text'}
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

              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={!userAnswer.trim()}
                  className="flex-1"
                >
                  Submit Answer
                </Button>
                <Button
                  onClick={() => setShowHint(!showHint)}
                  variant="outline"
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
                    <p className="text-sm">{currentStep.hint}</p>
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
                    <p className="text-sm">
                      {isCorrect ? currentStep.feedback_correct : currentStep.feedback_incorrect}
                    </p>
                  </div>
                </div>
              </div>

              {/* Explanation */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="font-medium mb-2">Explanation:</p>
                <p className="text-sm text-muted-foreground mb-3">{currentStep.explanation}</p>
                <div className="bg-accent/50 p-3 rounded">
                  <p className="text-sm">
                    <span className="font-medium">Correct answer:</span> {currentStep.correct_answer}
                  </p>
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
                <li>Don't worry about mistakes - they're part of learning!</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
