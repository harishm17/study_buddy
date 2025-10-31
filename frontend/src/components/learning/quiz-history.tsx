'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Calendar, Award } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface QuizAttempt {
  id: string
  score: number
  takenAt: string
}

interface QuizHistoryProps {
  topicId: string
}

export function QuizHistory({ topicId }: QuizHistoryProps) {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHistory()
  }, [topicId])

  const fetchHistory = async () => {
    try {
      const response = await fetch(`/api/topics/${topicId}/quiz-attempts`)
      if (!response.ok) throw new Error('Failed to fetch history')

      const data = await response.json()
      setAttempts(data.attempts)
      setStats(data.stats)
    } catch (error) {
      console.error('Error fetching quiz history:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || attempts.length === 0) {
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
    if (score >= 90) return 'text-green-600 dark:text-green-400'
    if (score >= 70) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Quiz History
        </CardTitle>
        <CardDescription>
          {stats.totalAttempts} attempt{stats.totalAttempts !== 1 ? 's' : ''} • Best: {Math.round(stats.bestScore)}%
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {Math.round(stats.bestScore)}%
              </div>
              <div className="text-xs text-muted-foreground">Best Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {Math.round(stats.latestScore)}%
              </div>
              <div className="text-xs text-muted-foreground">Latest</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">
                {Math.round(stats.averageScore)}%
              </div>
              <div className="text-xs text-muted-foreground">Average</div>
            </div>
          </div>

          {/* Attempts List */}
          <div className="space-y-2">
            <div className="text-sm font-medium mb-2">Recent Attempts:</div>
            {attempts.slice(0, 5).map((attempt, index) => (
              <div
                key={attempt.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono">
                    #{attempts.length - index}
                  </Badge>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatDate(attempt.takenAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${getScoreColor(attempt.score)}`}>
                    {Math.round(attempt.score)}%
                  </span>
                  {attempt.score === stats.bestScore && (
                    <Award className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {attempts.length > 5 && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              Showing 5 of {attempts.length} attempts
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
