'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { TrendingUp, Calendar, Award, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MarkdownBlock } from '@/components/ui/markdown'
import { formatLearningMarkdown } from '@/lib/utils/learning-markdown'

interface QuizQuestion {
  question_type: 'multiple_choice' | 'short_answer' | 'numerical' | 'true_false'
  question_text: string
  options?: Array<{ id: string; text: string }>
  correct_answer: string | boolean | number
  explanation: string
  points: number
}

interface QuizAttempt {
  id: string
  score: number
  takenAt: string
  answers: Record<string, string>
  results: Record<string, boolean>
}

interface QuizHistoryProps {
  topicId: string
  quizSetId?: string | null
  questions?: QuizQuestion[]
  refreshKey?: number
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const record: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      record[key] = String(entry)
    }
  }

  return record
}

function parseBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const record: Record<string, boolean> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'boolean') {
      record[key] = entry
      continue
    }
    if (typeof entry === 'string') {
      const normalized = entry.trim().toLowerCase()
      if (normalized === 'true' || normalized === '1') {
        record[key] = true
      } else if (normalized === 'false' || normalized === '0') {
        record[key] = false
      }
      continue
    }
    if (typeof entry === 'number') {
      if (entry === 1) {
        record[key] = true
      } else if (entry === 0) {
        record[key] = false
      }
    }
  }

  return record
}

function normalizeAnswer(
  question: QuizQuestion,
  rawValue: string | boolean | number | undefined
): string {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim().length === 0) {
    return 'No answer'
  }

  if (question.question_type === 'true_false') {
    const normalized = String(rawValue).trim().toLowerCase()
    if (normalized === 'true' || normalized === 't' || normalized === '1') return 'True'
    if (normalized === 'false' || normalized === 'f' || normalized === '0') return 'False'
  }

  if (question.question_type === 'multiple_choice') {
    const normalized = String(rawValue).trim().toLowerCase()
    const option = question.options?.find((candidate) => candidate.id.toLowerCase() === normalized)
    if (option) {
      return `${option.id}. ${option.text}`
    }
  }

  return String(rawValue)
}

export function QuizHistory({ topicId, quizSetId, questions = [], refreshKey = 0 }: QuizHistoryProps) {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const query = quizSetId ? `?quizSetId=${encodeURIComponent(quizSetId)}` : ''
      const response = await fetch(`/api/topics/${topicId}/quiz-attempts${query}`)
      if (!response.ok) throw new Error('Failed to fetch history')

      const data = await response.json()
      const normalizedAttempts: QuizAttempt[] = Array.isArray(data.attempts)
        ? data.attempts.map((attempt: Record<string, unknown>) => ({
            id: String(attempt.id ?? ''),
            score: Number(attempt.score ?? 0),
            takenAt: String(attempt.takenAt ?? ''),
            answers: parseStringRecord(attempt.answers),
            results: parseBooleanRecord(attempt.results),
          }))
        : []
      setAttempts(normalizedAttempts)
      setStats(data.stats)
    } catch (error) {
      console.error('Error fetching quiz history:', error)
      setError('Unable to load quiz history.')
    } finally {
      setLoading(false)
    }
  }, [topicId, quizSetId])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory, refreshKey])

  const sortedAttempts = useMemo(() => {
    return [...attempts].sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime())
  }, [attempts])

  useEffect(() => {
    if (sortedAttempts.length === 0) {
      setExpandedAttemptId(null)
      return
    }

    setExpandedAttemptId((previous) => {
      if (previous && sortedAttempts.some((attempt) => attempt.id === previous)) {
        return previous
      }
      return sortedAttempts[0].id
    })
  }, [sortedAttempts])

  const effectiveStats = stats || (() => {
    if (attempts.length === 0) {
      return null
    }
    const scores = attempts.map((attempt) => attempt.score)
    const total = scores.reduce((sum, score) => sum + score, 0)
    const latestAttempt = sortedAttempts[0]
    return {
      totalAttempts: attempts.length,
      bestScore: Math.max(...scores),
      latestScore: latestAttempt?.score ?? 0,
      averageScore: total / attempts.length,
    }
  })()

  if (loading) {
    return null
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => fetchHistory()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (attempts.length === 0) {
    return null
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (!effectiveStats) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Quiz History
        </CardTitle>
        <CardDescription>
          {effectiveStats.totalAttempts} attempt{effectiveStats.totalAttempts !== 1 ? 's' : ''} • Best: {Math.round(effectiveStats.bestScore)}%
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Stats Summary */}
          <div className="mb-4 grid grid-cols-3 gap-4 rounded-xl border border-border/70 bg-white/70 p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {Math.round(effectiveStats.bestScore)}%
              </div>
              <div className="text-xs text-muted-foreground">Best Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {Math.round(effectiveStats.latestScore)}%
              </div>
              <div className="text-xs text-muted-foreground">Latest</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">
                {Math.round(effectiveStats.averageScore)}%
              </div>
              <div className="text-xs text-muted-foreground">Average</div>
            </div>
          </div>

          {/* Attempts List */}
          <div className="space-y-2">
            <div className="text-sm font-medium mb-2">Recent Attempts:</div>
            {sortedAttempts.slice(0, 5).map((attempt, index) => {
              const isExpanded = expandedAttemptId === attempt.id
              return (
                <div key={attempt.id} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setExpandedAttemptId((prev) => (prev === attempt.id ? null : attempt.id))}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isExpanded
                        ? 'border-primary/35 bg-primary/[0.05]'
                        : 'border-border/70 bg-white/70 hover:border-primary/30 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono">
                          #{sortedAttempts.length - index}
                        </Badge>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(attempt.takenAt)}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold ${getScoreColor(attempt.score)}`}>
                          {Math.round(attempt.score)}%
                        </span>
                        {attempt.score === effectiveStats.bestScore && (
                          <Award className="h-4 w-4 text-yellow-500" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {isExpanded ? 'Hide review' : 'View review'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="rounded-xl border border-border/70 bg-white/80 p-3 space-y-3">
                      {questions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Question details are unavailable for this attempt.
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Review of your answers, correct answers, and explanations.
                          </p>
                          <div className="space-y-3">
                            {questions.map((question, questionIndex) => {
                              const answerKey = String(questionIndex)
                              const userAnswerRaw = attempt.answers[answerKey]
                              const userAnswer = normalizeAnswer(question, userAnswerRaw)
                              const correctAnswer = normalizeAnswer(question, question.correct_answer)
                              const wasCorrect = attempt.results[answerKey] === true
                              return (
                                <div
                                  key={`${attempt.id}-${questionIndex}`}
                                  className={`rounded-xl border p-3 ${
                                    wasCorrect
                                      ? 'border-green-200 bg-green-50/70'
                                      : 'border-red-200 bg-red-50/70'
                                  }`}
                                >
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">Question {questionIndex + 1}</Badge>
                                    <Badge variant="outline">{question.points || 1} point{(question.points || 1) === 1 ? '' : 's'}</Badge>
                                    {wasCorrect ? (
                                      <Badge className="bg-green-600 text-white hover:bg-green-600">
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        Correct
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-red-600 text-white hover:bg-red-600">
                                        <XCircle className="mr-1 h-3 w-3" />
                                        Incorrect
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="mb-3 text-sm font-medium leading-relaxed">
                                    <MarkdownBlock content={formatLearningMarkdown(question.question_text)} variant="compact" />
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                                      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                        Your Answer
                                      </div>
                                      <MarkdownBlock content={formatLearningMarkdown(userAnswer)} variant="compact" />
                                    </div>
                                    <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                                      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                        Correct Answer
                                      </div>
                                      <MarkdownBlock content={formatLearningMarkdown(correctAnswer)} variant="compact" />
                                    </div>
                                  </div>
                                  <div className="mt-3 rounded-lg border border-border/60 bg-white/80 p-3">
                                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                      Explanation
                                    </div>
                                    <MarkdownBlock content={formatLearningMarkdown(question.explanation)} variant="compact" />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {sortedAttempts.length > 5 && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              Showing 5 of {sortedAttempts.length} attempts
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
