'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, ClipboardList, Award, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { QuizHistory } from './quiz-history'

interface QuizQuestion {
  question_type: 'multiple_choice' | 'short_answer' | 'numerical' | 'true_false'
  question_text: string
  options?: Array<{ id: string; text: string }>
  correct_answer: string | boolean | number
  sample_answer?: string
  key_points?: string[]
  unit?: string
  tolerance?: number
  explanation: string
  points: number
  difficulty: string
  concepts_tested: string[]
}

interface QuizInterfaceProps {
  questions: QuizQuestion[]
  metadata: any
  topicId: string
  userId: string
  isCompleted: boolean
  previousScore: number | null
}

export function QuizInterface({
  questions,
  metadata,
  topicId,
  userId,
  isCompleted,
  previousScore,
}: QuizInterfaceProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<Record<number, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const currentQuestion = questions[currentQuestionIndex]
  const currentAnswer = answers[currentQuestionIndex] || ''

  const handleAnswerChange = (value: string) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: value,
    }))
  }

  const checkAnswer = (question: QuizQuestion, userAnswer: string): boolean => {
    const normalized = userAnswer.trim().toLowerCase()

    switch (question.question_type) {
      case 'multiple_choice':
        return normalized === String(question.correct_answer).toLowerCase()

      case 'true_false':
        const boolAnswer = normalized === 'true' || normalized === 't' || normalized === '1'
        return boolAnswer === question.correct_answer

      case 'numerical':
        const userNum = parseFloat(userAnswer)
        const correctNum = parseFloat(String(question.correct_answer))
        const tolerance = question.tolerance || 0.01
        return !isNaN(userNum) && !isNaN(correctNum) && Math.abs(userNum - correctNum) <= tolerance

      case 'short_answer':
        // For short answer, check if it includes key points (basic check)
        if (question.key_points) {
          const matchedPoints = question.key_points.filter(point =>
            normalized.includes(point.toLowerCase())
          )
          return matchedPoints.length >= Math.ceil(question.key_points.length * 0.5)
        }
        return normalized.includes(String(question.sample_answer).toLowerCase())

      default:
        return false
    }
  }

  const handleSubmitQuiz = async () => {
    // Grade all questions
    const gradedResults: Record<number, boolean> = {}
    let correctCount = 0

    questions.forEach((question, index) => {
      const isCorrect = checkAnswer(question, answers[index] || '')
      gradedResults[index] = isCorrect
      if (isCorrect) correctCount++
    })

    setResults(gradedResults)
    setSubmitted(true)

    // Calculate score
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0)
    const earnedPoints = questions.reduce((sum, q, i) => {
      return sum + (gradedResults[i] ? q.points : 0)
    }, 0)
    const scorePercentage = (earnedPoints / totalPoints) * 100

    // Save quiz attempt to database
    try {
      setSubmitting(true)

      const response = await fetch(`/api/topics/${topicId}/quiz-attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          results: gradedResults,
          score: scorePercentage,
        }),
      })

      if (!response.ok) throw new Error('Failed to save quiz attempt')
    } catch (error) {
      console.error('Error saving quiz:', error)
      alert('Quiz graded but failed to save results')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetakeQuiz = () => {
    setAnswers({})
    setResults({})
    setSubmitted(false)
    setCurrentQuestionIndex(0)
  }

  const handleRetakeWithNewQuestions = async () => {
    try {
      setRegenerating(true)

      const response = await fetch(`/api/topics/${topicId}/regenerate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'topic_quiz',
          preferences: {
            question_count: metadata?.total_questions || 10,
            difficulty_level: metadata?.difficulty_level || 'medium',
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to generate new quiz')

      const data = await response.json()

      // Poll for job completion
      await pollJobStatus(data.jobId)

      // Reload page to show new quiz
      window.location.reload()
    } catch (error) {
      console.error('Error generating new quiz:', error)
      alert('Failed to generate new quiz')
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

  const calculateScore = () => {
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0)
    const earnedPoints = questions.reduce((sum, q, i) => {
      return sum + (results[i] ? q.points : 0)
    }, 0)
    return {
      earned: earnedPoints,
      total: totalPoints,
      percentage: (earnedPoints / totalPoints) * 100,
    }
  }

  const answeredCount = Object.keys(answers).length
  const allAnswered = answeredCount === questions.length

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <ClipboardList className="h-6 w-6 text-primary" />
                <CardTitle>Topic Quiz</CardTitle>
                {isCompleted && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Completed
                  </Badge>
                )}
              </div>
              <CardDescription>
                {questions.length} questions • {metadata.total_questions || questions.length} total points
              </CardDescription>
            </div>

            {previousScore !== null && (
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Previous Score</div>
                <div className="text-2xl font-bold">{Math.round(previousScore)}%</div>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Results Summary (After Submission) */}
      {submitted && (
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Award className="h-8 w-8 text-primary" />
              <div className="flex-1">
                <CardTitle className="text-2xl">Quiz Complete!</CardTitle>
                <CardDescription>
                  You scored {calculateScore().earned} out of {calculateScore().total} points
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-primary">
                  {Math.round(calculateScore().percentage)}%
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button onClick={handleRetakeQuiz} variant="outline" className="flex-1">
                Retake Same Quiz
              </Button>
              <Button
                onClick={handleRetakeWithNewQuestions}
                disabled={regenerating}
                variant="outline"
                className="flex-1"
              >
                {regenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    New Questions
                  </>
                )}
              </Button>
              <Button onClick={() => window.location.reload()} className="flex-1">
                Continue Learning
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      {!submitted && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {answeredCount} / {questions.length} answered
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Question Navigation */}
      <div className="flex flex-wrap gap-2">
        {questions.map((_, index) => (
          <Button
            key={index}
            variant={currentQuestionIndex === index ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCurrentQuestionIndex(index)}
            className="relative"
          >
            {index + 1}
            {answers[index] && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
            )}
            {submitted && results[index] !== undefined && (
              <div className="absolute -top-1 -right-1">
                {results[index] ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            )}
          </Button>
        ))}
      </div>

      {/* Current Question */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </Badge>
                <Badge variant="outline">{currentQuestion.points} points</Badge>
                <Badge variant="secondary">{currentQuestion.difficulty}</Badge>
              </div>
              <CardTitle className="text-lg">{currentQuestion.question_text}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Answer Input */}
          {!submitted && (
            <>
              {currentQuestion.question_type === 'multiple_choice' && (
                <RadioGroup value={currentAnswer} onValueChange={handleAnswerChange}>
                  <div className="space-y-3">
                    {currentQuestion.options?.map((option) => (
                      <div
                        key={option.id}
                        className="flex items-center space-x-3 border rounded-lg p-4 hover:bg-accent/50 cursor-pointer"
                        onClick={() => handleAnswerChange(option.id)}
                      >
                        <RadioGroupItem value={option.id} id={option.id} />
                        <Label htmlFor={option.id} className="flex-1 cursor-pointer">
                          {option.id}. {option.text}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              )}

              {currentQuestion.question_type === 'true_false' && (
                <RadioGroup value={currentAnswer} onValueChange={handleAnswerChange}>
                  <div className="space-y-3">
                    <div
                      className="flex items-center space-x-3 border rounded-lg p-4 hover:bg-accent/50 cursor-pointer"
                      onClick={() => handleAnswerChange('true')}
                    >
                      <RadioGroupItem value="true" id="true" />
                      <Label htmlFor="true" className="flex-1 cursor-pointer">
                        True
                      </Label>
                    </div>
                    <div
                      className="flex items-center space-x-3 border rounded-lg p-4 hover:bg-accent/50 cursor-pointer"
                      onClick={() => handleAnswerChange('false')}
                    >
                      <RadioGroupItem value="false" id="false" />
                      <Label htmlFor="false" className="flex-1 cursor-pointer">
                        False
                      </Label>
                    </div>
                  </div>
                </RadioGroup>
              )}

              {currentQuestion.question_type === 'numerical' && (
                <div className="space-y-2">
                  <Input
                    type="number"
                    step="any"
                    placeholder="Enter your answer..."
                    value={currentAnswer}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    className="text-lg"
                  />
                  {currentQuestion.unit && (
                    <p className="text-sm text-muted-foreground">Unit: {currentQuestion.unit}</p>
                  )}
                </div>
              )}

              {currentQuestion.question_type === 'short_answer' && (
                <div className="space-y-2">
                  <textarea
                    placeholder="Type your answer here..."
                    value={currentAnswer}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    className="w-full min-h-[120px] p-3 border rounded-lg resize-none"
                  />
                  {currentQuestion.key_points && (
                    <p className="text-sm text-muted-foreground">
                      Include these concepts: {currentQuestion.key_points.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Feedback (After Submission) */}
          {submitted && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg border-2 ${
                  results[currentQuestionIndex]
                    ? 'bg-green-500/10 border-green-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                <div className="flex gap-3">
                  {results[currentQuestionIndex] ? (
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold mb-1">
                      {results[currentQuestionIndex] ? 'Correct!' : 'Incorrect'}
                    </p>
                    <p className="text-sm mb-3">Your answer: {answers[currentQuestionIndex] || 'No answer'}</p>
                    {!results[currentQuestionIndex] && (
                      <p className="text-sm">
                        Correct answer: {String(currentQuestion.correct_answer)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="font-medium mb-2">Explanation:</p>
                <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            {!submitted ? (
              <>
                {currentQuestionIndex < questions.length - 1 ? (
                  <Button
                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                    className="flex-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmitQuiz}
                    disabled={!allAnswered || submitting}
                    className="flex-1"
                  >
                    {submitting ? 'Submitting...' : 'Submit Quiz'}
                  </Button>
                )}
              </>
            ) : (
              <Button
                onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
                disabled={currentQuestionIndex === questions.length - 1}
                className="flex-1"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quiz History */}
      {!submitted && <QuizHistory topicId={topicId} />}
    </div>
  )
}
