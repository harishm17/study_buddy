'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Clock, Award, TrendingUp, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface Submission {
  id: string;
  submittedAt: string;
  gradedAt: string | null;
  score: number | null;
  isPending: boolean;
}

interface Stats {
  bestScore: number;
  latestScore: number;
  averageScore: number;
  totalAttempts: number;
}

interface ExamHistoryProps {
  examId: string;
}

export default function ExamHistory({ examId }: ExamHistoryProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/exams/${examId}/submissions`);

      if (!response.ok) {
        throw new Error('Failed to fetch exam history');
      }

      const data = await response.json();
      setSubmissions(data.submissions || []);
      setStats(data.stats);
    } catch (err: any) {
      console.error('Error fetching history:', err);
      setError(err.message || 'Failed to load exam history');
    } finally {
      setIsLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const sortedSubmissions = useMemo(() => {
    return [...submissions].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  }, [submissions]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading history...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (submissions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exam History</CardTitle>
          <CardDescription>No attempts yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You haven&apos;t taken this exam yet. Start your first attempt!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Your Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Award className="h-5 w-5 text-green-600" />
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(stats.bestScore)}%
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Best Score</div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(stats.latestScore)}%
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Latest Score</div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.round(stats.averageScore)}%
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Average Score</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Attempts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attempts</CardTitle>
          <CardDescription>
            {submissions.length} attempt{submissions.length !== 1 ? 's' : ''} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedSubmissions.slice(0, 5).map((submission, index) => (
              <div
                key={submission.id}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-white/70 p-4 transition hover:border-primary/30 hover:bg-white"
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {format(new Date(submission.submittedAt), 'MMM dd, yyyy')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(submission.submittedAt), 'h:mm a')}
                      </span>
                    </div>
                    {submission.isPending && (
                      <span className="text-xs text-muted-foreground mt-1">
                        Grading in progress...
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {submission.isPending ? (
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      Pending
                    </Badge>
                  ) : submission.score !== null ? (
                    <>
                      {stats && submission.score === stats.bestScore && (
                        <Award className="h-5 w-5 text-yellow-500" />
                      )}
                      <div
                        className={`text-xl font-bold ${
                          submission.score >= 90
                            ? 'text-green-600'
                            : submission.score >= 70
                            ? 'text-blue-600'
                            : submission.score >= 50
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {Math.round(submission.score)}%
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not graded</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {sortedSubmissions.length > 5 && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Showing 5 of {sortedSubmissions.length} attempts
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
