'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';

// The exam taker (with markdown and the question navigator) and the history list load on
// demand instead of with the page.
const ExamInterface = dynamic(() => import('./exam-interface'), {
  loading: () => <div className="h-64 animate-pulse rounded-2xl border border-border/70 bg-white/60" role="status" aria-label="Loading exam" />,
});
const ExamHistory = dynamic(() => import('./exam-history'), {
  loading: () => <div className="h-32 animate-pulse rounded-2xl border border-border/70 bg-white/60" role="status" aria-label="Loading history" />,
});
import { ArrowLeft, Clock, BarChart3, BookOpen, Play, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { AttemptView } from '@/lib/exams/attempts';
import { PageHeader } from '@/components/ui/page-shell';

interface ExamQuestion {
  question_type: 'multiple_choice' | 'short_answer' | 'numerical' | 'true_false';
  question_text: string;
  topic_name?: string;
  points?: number;
  difficulty?: string;
  options?: Array<{ id: string; text: string }>;
  unit?: string;
}

interface Exam {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  questions: ExamQuestion[];
  durationMinutes: number;
  difficultyLevel: string;
  topicsCovered: string[];
  createdAt: string;
}

interface ExamPageClientProps {
  exam: Exam;
  /** The attempt in progress, if the student already started (a refresh resumes it). */
  initialAttempt: AttemptView | null;
}

export default function ExamPageClient({ exam, initialAttempt }: ExamPageClientProps) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptView | null>(initialAttempt);
  // The server tells us how many seconds are left; the deadline is then kept on this clock.
  const [deadlineAtMs, setDeadlineAtMs] = useState(() =>
    initialAttempt ? Date.now() + initialAttempt.remainingSeconds * 1000 : 0
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openResults = useCallback(
    (submissionId: string) => router.push(`/exams/${exam.id}/results/${submissionId}`),
    [exam.id, router]
  );

  const handleStartExam = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/exams/${exam.id}/attempt`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not start the exam. Please try again.');
      const data = (await response.json()) as { attempt: AttemptView };
      setDeadlineAtMs(Date.now() + data.attempt.remainingSeconds * 1000);
      setAttempt(data.attempt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the exam. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmitExam = useCallback(
    async (answers: Record<string, any>) => {
      setIsSubmitting(true);
      setError(null);

      try {
        const response = await fetch(`/api/exams/${exam.id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok || (typeof data?.submissionId === 'string' && response.status === 502)) {
          // Grading is followed on the results page, which also picks it up after a refresh.
          openResults(data.submissionId);
          return;
        }
        if (response.status === 409) {
          // Submitted already (another tab, or time ran out): the history has it.
          router.refresh();
          setAttempt(null);
          throw new Error(data?.error?.message || 'This exam was already submitted.');
        }
        throw new Error(
          data?.error?.message || 'Failed to submit exam. Please try again.'
        );
      } catch (err) {
        console.error('Error submitting exam:', err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to submit exam. Please try again.'
        );
        setIsSubmitting(false);
      }
    },
    [exam.id, openResults, router]
  );

  const errorBanner = error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (attempt) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          eyebrow={exam.projectName}
          title={exam.name}
          description={`${exam.questions.length} questions • ${exam.durationMinutes} minutes • ${exam.difficultyLevel} difficulty`}
          actions={
            <Link href={`/projects/${exam.projectId}`}>
              <Button variant="back" size="back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Project
              </Button>
            </Link>
          }
        />
        {errorBanner}

        {/* Exam Interface */}
        <ExamInterface
          examId={exam.id}
          examName={exam.name}
          questions={exam.questions}
          deadlineAtMs={deadlineAtMs}
          initialAnswers={attempt.answers}
          onSubmit={handleSubmitExam}
          onEnded={(submissionId) =>
            submissionId ? openResults(submissionId) : router.refresh()
          }
          isSubmitting={isSubmitting}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow={exam.projectName}
        title={exam.name}
        description="Timed exam with autosave and AI grading. The timer runs on the server, so a refresh does not restart it."
        actions={
          <Link href={`/projects/${exam.projectId}`}>
            <Button variant="back" size="back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Project
            </Button>
          </Link>
        }
      />
      {errorBanner}

      {/* Exam Info */}
      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{exam.questions.length} Questions</div>
                <div className="text-xs text-muted-foreground">Total questions</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{exam.durationMinutes} Minutes</div>
                <div className="text-xs text-muted-foreground">Time limit</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium capitalize">{exam.difficultyLevel}</div>
                <div className="text-xs text-muted-foreground">Difficulty</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Topics Covered:</div>
            <div className="flex flex-wrap gap-2">
              {exam.topicsCovered.map((topic, index) => (
                <Badge key={index} variant="secondary">
                  {topic}
                </Badge>
              ))}
            </div>
          </div>

          <Alert>
            <AlertDescription>
              <strong>Instructions:</strong> This is a timed exam. Once you start, the timer will
              begin counting down on our server, so refreshing the page or coming back later does not
              reset it. Your answers are saved as you go, and what is saved is submitted
              automatically when time runs out.
            </AlertDescription>
          </Alert>

          <Button onClick={handleStartExam} size="lg" className="w-full" disabled={isStarting}>
            {isStarting ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="mr-2 h-5 w-5" />
            )}
            {isStarting ? 'Starting...' : 'Start Exam'}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <ExamHistory examId={exam.id} />
    </div>
  );
}
