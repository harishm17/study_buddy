'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, ClipboardList, Award, Sparkles, Loader2, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { QuizHistory, formatAnswer } from './quiz-history'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { pollFailureMessage, useJobPolling } from '@/hooks/useJobPolling'
import { MarkdownBlock, MarkdownInline } from '@/components/ui/markdown'
import { formatLearningMarkdown } from '@/lib/utils/learning-markdown'
import type { PublicQuizQuestion } from '@/lib/learning/quiz-questions'
import type { QuizReviewItem } from '@/lib/learning/quiz-review'

// The browser never holds the answer key before submitting; see lib/learning/quiz-questions.
type QuizQuestion = PublicQuizQuestion

interface QuizSet {
  id: string
  questions: QuizQuestion[]
  createdAt: string | Date
}

interface QuizInterfaceProps {
  quizSets: QuizSet[]
  fallbackQuestions: QuizQuestion[]
  metadata: any
  topicId: string
  userId: string
  isCompleted: boolean
}

export function QuizInterface({
  quizSets,
  fallbackQuestions,
  metadata,
  topicId,
  userId,
  isCompleted,
}: QuizInterfaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const resolvedQuizSets = useMemo(() => {
    if (quizSets && quizSets.length > 0) return quizSets
    if (fallbackQuestions && fallbackQuestions.length > 0) {
      return [{
        id: 'legacy',
        questions: fallbackQuestions,
        createdAt: new Date().toISOString(),
      }]
    }
    return []
  }, [fallbackQuestions, quizSets])
  const orderedQuizSets = useMemo(() => {
    return [...resolvedQuizSets].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  }, [resolvedQuizSets])
  const mostRecentQuizSetId = useMemo(() => {
    const latest = [...resolvedQuizSets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0]
    return latest?.id || null
  }, [resolvedQuizSets])
  const quizSetLabelById = useMemo(() => {
    const labelMap = new Map<string, string>()
    orderedQuizSets.forEach((set, index) => {
      labelMap.set(set.id, set.id === 'legacy' ? 'Original Set' : `Set ${index + 1}`)
    })
    return labelMap
  }, [orderedQuizSets])
  const [activeQuizSetId, setActiveQuizSetId] = useState<string | null>(
    mostRecentQuizSetId
  )
  const activeQuizSet = useMemo(() => {
    if (!activeQuizSetId) return resolvedQuizSets[0] || null
    return resolvedQuizSets.find(set => set.id === activeQuizSetId) || resolvedQuizSets[0] || null
  }, [activeQuizSetId, resolvedQuizSets])
  const questions = activeQuizSet?.questions || []
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)
  // Set by the server after grading. Null until the quiz has been submitted.
  const [review, setReview] = useState<QuizReviewItem[] | null>(null)
  const [scoreSummary, setScoreSummary] = useState<{ earned: number; total: number; percentage: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generationNotice, setGenerationNotice] = useState<string | null>(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [activeSetStats, setActiveSetStats] = useState<{
    totalAttempts: number
    latestScore: number | null
    bestScore: number | null
  } | null>(null)
  const [focusText, setFocusText] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const isMountedRef = useRef(true)
  const { pollJob, stopPolling } = useJobPolling({ timeoutMs: 180_000 })

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      stopPolling()
    }
  }, [stopPolling])

  useEffect(() => {
    if (resolvedQuizSets.length === 0) return
    setActiveQuizSetId(mostRecentQuizSetId)
    setCurrentQuestionIndex(0)
    setAnswers({})
    setReview(null)
    setScoreSummary(null)
    setSubmitted(false)
  }, [mostRecentQuizSetId, resolvedQuizSets])

  useEffect(() => {
    setCurrentQuestionIndex(0)
    setAnswers({})
    setReview(null)
    setScoreSummary(null)
    setSubmitted(false)
  }, [activeQuizSetId])

  useEffect(() => {
    let cancelled = false
    const loadSetStats = async () => {
      try {
        const query = activeQuizSetId ? `?quizSetId=${encodeURIComponent(activeQuizSetId)}` : ''
        const response = await fetch(`/api/topics/${topicId}/quiz-attempts${query}`)
        if (!response.ok) {
          if (!cancelled) setActiveSetStats(null)
          return
        }
        const payload = await response.json()
        const stats = payload?.stats
        if (cancelled || !stats) return
        setActiveSetStats({
          totalAttempts: Number(stats.totalAttempts || 0),
          latestScore: typeof stats.latestScore === 'number' ? stats.latestScore : null,
          bestScore: typeof stats.bestScore === 'number' ? stats.bestScore : null,
        })
      } catch {
        if (!cancelled) setActiveSetStats(null)
      }
    }

    void loadSetStats()
    return () => {
      cancelled = true
    }
  }, [activeQuizSetId, historyRefreshKey, topicId])

  useEffect(() => {
    if (selectedTypes.length > 0) return
    setSelectedTypes(['multiple_choice', 'short_answer', 'numerical', 'true_false'])
  }, [selectedTypes.length])

  const currentQuestion = questions[currentQuestionIndex]
  const currentAnswer = answers[currentQuestionIndex] || ''
  const getQuestionPoints = (question: QuizQuestion) =>
    Number.isFinite(question.points) && question.points > 0 ? question.points : 1

  const handleAnswerChange = (value: string) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: value,
    }))
  }

  const toggleQuestionType = (type: string) => {
    setSelectedTypes(prev => {
      if (prev.includes(type)) {
        const next = prev.filter(t => t !== type)
        return next.length === 0 ? prev : next
      }
      return [...prev, type]
    })
  }

  const handleSubmitQuiz = async () => {
    // The server grades the answers against the stored quiz and sends back the results.
    try {
      setSubmitting(true)
      setError(null)

      const response = await fetch(`/api/topics/${topicId}/quiz-attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          quizSetId: activeQuizSetId && activeQuizSetId !== 'legacy' ? activeQuizSetId : undefined,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : 'Failed to grade the quiz'
        )
      }

      if (!isMountedRef.current) return
      setReview(payload.review as QuizReviewItem[])
      setScoreSummary({
        earned: Number(payload.earnedPoints) || 0,
        total: Number(payload.totalPoints) || 0,
        percentage: Number(payload.score) || 0,
      })
      setSubmitted(true)
      setCurrentQuestionIndex(0)
      setHistoryRefreshKey(prev => prev + 1)
    } catch (error) {
      console.error('Error submitting quiz:', error)
      if (!isMountedRef.current) return
      // Answers stay in place so the student can submit again.
      setError(error instanceof Error ? error.message : 'Failed to grade the quiz')
    } finally {
      if (!isMountedRef.current) return
      setSubmitting(false)
    }
  }

  const handleRetakeQuiz = () => {
    setAnswers({})
    setReview(null)
    setScoreSummary(null)
    setSubmitted(false)
    setCurrentQuestionIndex(0)
    setError(null)
  }

  const handleGenerateNewQuizSet = async () => {
    try {
      stopPolling()
      setRegenerating(true)
      setError(null)
      setGenerationNotice(null)

      const focus = focusText.trim()
      const preferences: Record<string, any> = {
        question_count: metadata?.total_questions || questions.length || 10,
        difficulty_level: metadata?.difficulty_level || 'medium',
      }
      if (focus) {
        preferences.focus = focus
      }
      if (selectedTypes.length > 0 && selectedTypes.length < 4) {
        preferences.question_types = selectedTypes
      }

      const response = await fetch(`/api/topics/${topicId}/regenerate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'topic_quiz',
          preferences,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate new quiz')

      const data = await response.json()
      const jobId = data?.jobId as string | undefined
      if (!jobId) {
        throw new Error('Missing job id')
      }
      setGenerationNotice('Generating a new quiz set in the background. You can keep reviewing this set.')

      // Poll in background and refresh when done.
      void (async () => {
        const pollResult = await pollJob(jobId)
        if (!isMountedRef.current) return
        if (pollResult.state === 'completed') {
          setGenerationNotice('New quiz set is ready.')
          setRegenerating(false)
          router.refresh()
          return
        }
        setError(pollFailureMessage(pollResult, 'Failed to generate new quiz set'))
        setRegenerating(false)
      })()
    } catch (error) {
      console.error('Error generating new quiz:', error)
      if (!isMountedRef.current) return
      setError('Failed to generate new quiz set')
      setRegenerating(false)
    }
  }

  const formatPoints = (value: number) => String(Math.round(value * 10) / 10)
  const currentReview = review?.[currentQuestionIndex] ?? null

  const totalQuestions = questions.length
  const totalPoints = questions.reduce((sum, q) => sum + getQuestionPoints(q), 0)
  const answeredCount = Object.values(answers).filter((answer) => answer.trim().length > 0).length
  const unansweredCount = Math.max(0, totalQuestions - answeredCount)
  const quizSetFilter = activeQuizSetId || null

  if (totalQuestions === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Topic Quiz</CardTitle>
          <CardDescription>
            There are no quiz questions available yet. Generate a quiz to get started.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const formatSetTimestamp = (value: string | Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  }

  const activeTypes = Array.from(
    new Set((activeQuizSet?.questions || []).map((q) => q.question_type))
  )

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
                {questions.length} questions • {totalPoints} total points
              </CardDescription>
            </div>

            {activeSetStats?.latestScore !== null && (
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Previous Score (this set)</div>
                <div className="text-2xl font-bold">{Math.round(activeSetStats?.latestScore ?? 0)}%</div>
                <div className="text-xs text-muted-foreground">
                  {activeSetStats?.totalAttempts ?? 0} attempt{(activeSetStats?.totalAttempts ?? 0) === 1 ? '' : 's'}
                  {activeSetStats?.bestScore !== null && activeSetStats?.bestScore !== undefined
                    ? ` • Best ${Math.round(activeSetStats.bestScore)}%`
                    : ''}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-xl border border-border/60 bg-white/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Quiz Sets
              </div>
              <div className="text-xs text-muted-foreground">
                {resolvedQuizSets.length} total
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {orderedQuizSets.map((set) => {
                const isActive = set.id === activeQuizSetId
                return (
                  <Button
                    key={set.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveQuizSetId(set.id)}
                    className={`rounded-xl border ${
                      isActive
                        ? 'border-primary/80 bg-primary !text-white hover:bg-primary/95 hover:!text-white [&_*]:!text-white'
                        : 'border-border/70 bg-white/80 text-foreground hover:border-primary/35 hover:bg-white'
                    }`}
                  >
                    {quizSetLabelById.get(set.id) || 'Set'}
                  </Button>
                )
              })}
            </div>
            {activeQuizSet && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-white/70 px-2.5 py-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {formatSetTimestamp(activeQuizSet.createdAt)}
                </span>
                <span className="rounded-full border border-border/70 bg-white/70 px-2.5 py-1">
                  {questions.length} questions
                </span>
                {activeTypes.map((type) => (
                  <Badge key={type} variant="outline" className="capitalize">
                    {type.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-border/60 bg-white/70 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              New Quiz Set Focus (optional)
            </div>
            <Input
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
              placeholder="e.g., conceptual questions, pointer subterfuge, stack layout"
              className="mt-2"
            />
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
                Question Types
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'multiple_choice', label: 'Multiple Choice' },
                  { id: 'short_answer', label: 'Short Answer' },
                  { id: 'numerical', label: 'Numerical' },
                  { id: 'true_false', label: 'True / False' },
                ].map((type) => {
                  const active = selectedTypes.includes(type.id)
                  return (
                    <Button
                      key={type.id}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleQuestionType(type.id)}
                    >
                      {type.label}
                    </Button>
                  )
                })}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Used when you generate a new quiz set. Past sets remain available.
            </p>
            <div className="mt-3">
              <Button
                onClick={handleGenerateNewQuizSet}
                disabled={regenerating}
                variant="outline"
              >
                {regenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    New Quiz Set
                  </>
                )}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Generates an additional set. Existing sets and attempt history remain available.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {generationNotice && (
        <Alert role="status" aria-live="polite">
          <AlertDescription>{generationNotice}</AlertDescription>
        </Alert>
      )}

      {/* Results Summary (After Submission) */}
      {submitted && (
        <Card className="border-primary/25 bg-primary/[0.04]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Award className="h-8 w-8 text-primary" />
              <div className="flex-1">
                <CardTitle className="text-2xl">Quiz Complete!</CardTitle>
                <CardDescription>
                  You scored {formatPoints(scoreSummary?.earned ?? 0)} out of {formatPoints(scoreSummary?.total ?? 0)} points
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-primary">
                  {Math.round(scoreSummary?.percentage ?? 0)}%
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                onClick={handleGenerateNewQuizSet}
                disabled={regenerating}
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
                    New Quiz Set
                  </>
                )}
              </Button>
              <Button onClick={handleRetakeQuiz} variant="outline" className="flex-1">
                Retake Same Set
              </Button>
              <Button
                onClick={() => router.push(`${pathname}?tab=voice_drill`)}
                variant="outline"
                className="flex-1"
              >
                Continue in Voice Coach
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
                  {answeredCount} / {totalQuestions} answered
                </span>
              </div>
              <Progress value={totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0} />
              <p className="text-xs text-muted-foreground">
                You can submit anytime. {unansweredCount} unanswered question{unansweredCount === 1 ? '' : 's'} will be graded as incorrect.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Question Navigation */}
      <div className="rounded-xl border border-border/70 bg-white/75 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Question Navigator
        </div>
        <div className="flex flex-wrap gap-2">
          {questions.map((_, index) => {
            const isActive = currentQuestionIndex === index
            const hasAnswer = (answers[index] || '').trim().length > 0
            const isCorrect = submitted && review?.[index]?.isCorrect === true
            const isIncorrect = submitted && review?.[index]?.isCorrect === false

            let stateClass = 'border-border/70 bg-white/80 text-foreground hover:border-primary/35 hover:bg-white'
            if (isCorrect) {
              stateClass = 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
            } else if (isIncorrect) {
              stateClass = 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
            } else if (hasAnswer) {
              stateClass = 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15'
            }
            if (isActive) {
              stateClass = 'border-primary/80 bg-primary text-white hover:bg-primary/95'
            }

            return (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => setCurrentQuestionIndex(index)}
                className={`rounded-full ${stateClass} ${isActive ? '[&_*]:!text-white !text-white' : ''}`}
                aria-label={`Question ${index + 1}`}
              >
                {index + 1}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Current Question */}
      <Card className="border-primary/25">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">
                  Question {currentQuestionIndex + 1} of {totalQuestions}
                </Badge>
                <Badge variant="outline">{currentQuestion.points} points</Badge>
                <Badge variant="secondary">{currentQuestion.difficulty}</Badge>
              </div>
              <div className="text-lg font-semibold leading-snug">
                <MarkdownBlock content={formatLearningMarkdown(currentQuestion.question_text)} variant="compact" />
              </div>
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
                        className="flex items-center space-x-3 rounded-xl border border-border/70 bg-white/75 p-4 transition hover:border-primary/30 hover:bg-white cursor-pointer"
                        onClick={() => handleAnswerChange(option.id)}
                      >
                        <RadioGroupItem value={option.id} id={option.id} />
                        <Label htmlFor={option.id} className="flex-1 cursor-pointer">
                          <span className="mr-1 font-medium">{option.id}.</span>
                          <MarkdownInline content={option.text} />
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
                      className="flex items-center space-x-3 rounded-xl border border-border/70 bg-white/75 p-4 transition hover:border-primary/30 hover:bg-white cursor-pointer"
                      onClick={() => handleAnswerChange('true')}
                    >
                      <RadioGroupItem value="true" id="true" />
                      <Label htmlFor="true" className="flex-1 cursor-pointer">
                        True
                      </Label>
                    </div>
                    <div
                      className="flex items-center space-x-3 rounded-xl border border-border/70 bg-white/75 p-4 transition hover:border-primary/30 hover:bg-white cursor-pointer"
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
                    className="min-h-[140px] w-full resize-none rounded-xl border border-border/70 bg-white/80 p-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  />
                  <p className="text-sm text-muted-foreground">
                    Answer in your own words. It is graded on meaning, not exact wording.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Feedback (After Submission) */}
          {submitted && currentReview && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg border-2 ${
                  currentReview.isCorrect
                    ? 'bg-green-500/10 border-green-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                <div className="flex gap-3">
                  {currentReview.isCorrect ? (
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold mb-1">
                      {currentReview.isCorrect ? 'Correct!' : 'Incorrect'}
                      {currentQuestion.question_type === 'short_answer' && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {formatPoints(currentReview.pointsEarned)} / {formatPoints(currentReview.pointsPossible)} points
                        </span>
                      )}
                    </p>
                    <p className="text-sm mb-3">
                      Your answer: {answers[currentQuestionIndex] || 'No answer'}
                    </p>
                    {currentReview.feedback && (
                      <div className="mb-3 text-sm">
                        <p className="font-medium mb-1">Feedback:</p>
                        <MarkdownBlock
                          content={formatLearningMarkdown(currentReview.feedback)}
                          variant="compact"
                        />
                      </div>
                    )}
                    {!currentReview.isCorrect && currentReview.correctAnswer && (
                      <div className="text-sm">
                        <p className="font-medium mb-1">
                          {currentQuestion.question_type === 'short_answer' ? 'Sample answer:' : 'Correct answer:'}
                        </p>
                        <MarkdownBlock
                          content={formatLearningMarkdown(formatAnswer(currentQuestion, currentReview.correctAnswer))}
                          variant="compact"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {currentReview.explanation && (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <p className="font-medium mb-2">Explanation:</p>
                  <MarkdownBlock
                    content={formatLearningMarkdown(currentReview.explanation)}
                    variant="compact"
                    className="text-muted-foreground"
                  />
                </div>
              )}
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
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? 'Submitting...' : 'Submit Quiz'}
                  </Button>
                )}
                {currentQuestionIndex < questions.length - 1 && (
                  <Button
                    variant="outline"
                    onClick={handleSubmitQuiz}
                    disabled={submitting}
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
      <QuizHistory
        topicId={topicId}
        quizSetId={quizSetFilter}
        questions={questions}
        refreshKey={historyRefreshKey}
      />
    </div>
  )
}
