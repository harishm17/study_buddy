'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, MinusCircle, RefreshCw, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-shell';
import { Progress } from '@/components/ui/progress';
import { MarkdownBlock } from '@/components/ui/markdown';
import { pollFailureMessage, useJobPolling } from '@/hooks/useJobPolling';
import { formatLearningMarkdown } from '@/lib/utils/learning-markdown';
import type { ExamQuestionResult, WeakTopic } from '@/lib/exams/results';

type ResultsTopic = WeakTopic & { linkable: boolean };

type SubmissionResults = {
  id: string;
  status: 'graded' | 'grading' | 'failed';
  submittedAt: string;
  gradedAt: string | null;
  score: number | null;
  earnedPoints: number | null;
  totalPoints: number | null;
  needsReviewCount?: number;
  questions: ExamQuestionResult[];
  topics: ResultsTopic[];
  gradingJob: { id: string; status: string; errorCode: string | null; errorMessage: string | null } | null;
};

interface ExamResultsProps {
  examId: string;
  submissionId: string;
  examName: string;
  projectId: string;
  projectName: string;
}

const formatPoints = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function outcomeOf(question: ExamQuestionResult) {
  if (question.needsReview) return { label: 'Needs review', icon: AlertTriangle, tone: 'text-amber-700' };
  if (question.isCorrect) return { label: 'Correct', icon: CheckCircle2, tone: 'text-green-700' };
  if (question.pointsEarned > 0) return { label: 'Partly correct', icon: MinusCircle, tone: 'text-amber-700' };
  return { label: 'Incorrect', icon: XCircle, tone: 'text-red-700' };
}

export default function ExamResults({ examId, submissionId, examName, projectId, projectName }: ExamResultsProps) {
  const [data, setData] = useState<SubmissionResults | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [onlyMissed, setOnlyMissed] = useState(false);
  const mountedRef = useRef(true);
  const { pollJob, stopPolling } = useJobPolling({ timeoutMs: 300_000 });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  const load = useCallback(async (): Promise<SubmissionResults | null> => {
    try {
      const response = await fetch(`/api/exams/${examId}/submissions/${submissionId}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load the results.');
      const payload = (await response.json()) as { submission: SubmissionResults };
      if (!mountedRef.current) return null;
      setData(payload.submission);
      setLoadError(null);
      return payload.submission;
    } catch (error) {
      if (mountedRef.current) {
        setLoadError(error instanceof Error ? error.message : 'Could not load the results.');
      }
      return null;
    }
  }, [examId, submissionId]);

  // Follow a grading job until it ends, then show what it produced.
  const followGrading = useCallback(
    async (jobId: string) => {
      setIsGrading(true);
      setNotice(null);
      const result = await pollJob(jobId);
      if (!mountedRef.current) return;
      if (result.state !== 'completed') {
        setNotice(pollFailureMessage(result, 'Grading did not finish. You can try again.'));
      }
      await load();
      if (mountedRef.current) setIsGrading(false);
    },
    [load, pollJob]
  );

  // Open the page, or reopen it after a refresh: if grading is still running, keep following it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const submission = await load();
      if (cancelled || !submission) return;
      const job = submission.gradingJob;
      if (job && (job.status === 'pending' || job.status === 'processing')) {
        await followGrading(job.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, followGrading]);

  const gradeAgain = async () => {
    setNotice(null);
    setIsGrading(true);
    try {
      const response = await fetch(`/api/exams/${examId}/submissions/${submissionId}/regrade`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload?.jobId !== 'string') {
        throw new Error(payload?.error?.message || 'Grading could not start. Please try again.');
      }
      await followGrading(payload.jobId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Grading could not start. Please try again.');
      setIsGrading(false);
    }
  };

  const header = (
    <PageHeader
      eyebrow={projectName}
      title={`Results: ${examName}`}
      description={
        data
          ? `Submitted ${new Date(data.submittedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
          : undefined
      }
      actions={
        <Link href={`/exams/${examId}`}>
          <Button variant="back" size="back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Exam
          </Button>
        </Link>
      }
    />
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : (
          <div
            className="h-40 animate-pulse rounded-2xl border border-border/70 bg-white/60"
            role="status"
            aria-label="Loading results"
          />
        )}
      </div>
    );
  }

  const gradingStatus = (
    <div role="status" aria-live="polite">
      {isGrading && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <AlertDescription>
            {data.status === 'graded'
              ? 'Grading again. The earlier results stay here until it finishes.'
              : 'Your exam is being graded. This usually takes a minute, and you can leave this page and come back.'}
          </AlertDescription>
        </Alert>
      )}
      {notice && !isGrading && (
        <Alert variant="destructive">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  if (data.status !== 'graded') {
    return (
      <div className="space-y-6">
        {header}
        {gradingStatus}
        {!isGrading && (
          <Card>
            <CardHeader>
              <CardTitle>Not graded yet</CardTitle>
              <CardDescription>
                {data.gradingJob?.status === 'failed'
                  ? 'Grading did not finish for this submission. Your answers are saved.'
                  : 'This submission has no grades yet. Your answers are saved.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={gradeAgain}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Grade again
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const questions = onlyMissed ? data.questions.filter((q) => !q.isCorrect) : data.questions;
  const needsReview = data.needsReviewCount ?? 0;

  return (
    <div className="space-y-6">
      {header}
      {gradingStatus}

      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <div className="text-4xl font-bold">{Math.round(data.score ?? 0)}%</div>
            <div className="text-sm text-muted-foreground">
              {formatPoints(data.earnedPoints ?? 0)} of {formatPoints(data.totalPoints ?? 0)} points
            </div>
          </div>
          <Button variant="outline" onClick={gradeAgain} disabled={isGrading}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Grade again
          </Button>
        </CardContent>
      </Card>

      {needsReview > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            {needsReview} answer{needsReview === 1 ? ' was' : 's were'} not graded automatically and
            scored 0 for now. Choose Grade again to try them again.
          </AlertDescription>
        </Alert>
      )}

      {data.topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Topics to work on</CardTitle>
            <CardDescription>Your score on each topic, weakest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.topics.map((topic) => (
                <li
                  key={topic.topicId ?? topic.topicName}
                  className="rounded-xl border border-border/70 bg-white/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{topic.topicName}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatPoints(topic.pointsEarned)} of {formatPoints(topic.pointsPossible)} points
                      {' · '}
                      <span className="font-semibold text-foreground">{Math.round(topic.percent)}%</span>
                    </div>
                  </div>
                  <Progress
                    value={topic.percent}
                    className="mt-2 h-2"
                    aria-label={`${topic.topicName}: ${Math.round(topic.percent)} percent`}
                  />
                  {topic.linkable && topic.topicId && (
                    <Link
                      href={`/projects/${projectId}/topics/${topic.topicId}`}
                      className="mt-2 inline-flex items-center text-sm font-medium text-primary hover:underline"
                    >
                      Study this topic
                      <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Questions</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyMissed}
            onChange={(event) => setOnlyMissed(event.target.checked)}
            className="h-4 w-4"
          />
          Show only questions I missed
        </label>
      </div>

      <ol className="space-y-4">
        {questions.map((question) => {
          const outcome = outcomeOf(question);
          const Icon = outcome.icon;
          return (
            <li key={question.questionIndex}>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-normal text-muted-foreground">
                        Question {question.questionIndex + 1}
                      </CardTitle>
                      {question.topicName && (
                        <div className="mt-1 text-sm text-muted-foreground">Topic: {question.topicName}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`inline-flex items-center gap-1 font-medium ${outcome.tone}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {outcome.label}
                      </span>
                      <Badge variant="outline">
                        {formatPoints(question.pointsEarned)} / {formatPoints(question.points)} pts
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 text-base font-medium">
                    <MarkdownBlock content={formatLearningMarkdown(question.questionText)} variant="compact" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answer</div>
                    <p className="mt-1 whitespace-pre-wrap">
                      {question.studentAnswer ?? <span className="text-muted-foreground">No answer</span>}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {question.questionType === 'short_answer' ? 'Sample answer' : 'Correct answer'}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{question.correctAnswer || 'Not available'}</p>
                  </div>
                  {question.feedback && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feedback</div>
                      <p className="mt-1 whitespace-pre-wrap">{question.feedback}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
      {questions.length === 0 && (
        <p className="text-sm text-muted-foreground">You got every question right.</p>
      )}
    </div>
  );
}
