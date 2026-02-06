'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import ExamInterface from './exam-interface';
import ExamHistory from './exam-history';
import { ArrowLeft, Clock, BarChart3, BookOpen, Play, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useJobPolling } from '@/hooks/useJobPolling';
import { PageHeader } from '@/components/ui/page-shell';

interface ExamQuestion {
  question_type: 'multiple_choice' | 'short_answer' | 'numerical' | 'true_false';
  question_text: string;
  topic_name?: string;
  points?: number;
  difficulty?: string;
  options?: Array<{ id: string; text: string }>;
  key_points?: string[];
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
}

export default function ExamPageClient({ exam }: ExamPageClientProps) {
  const router = useRouter();
  const [isStarted, setIsStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const { pollJob, stopPolling } = useJobPolling({ timeoutMs: 300_000 });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  const handleStartExam = () => {
    setIsStarted(true);
  };

  const handleSubmitExam = async (answers: Record<string, any>) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/exams/${exam.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit exam');
      }

      const data = await response.json();
      setJobId(data.jobId);
      setSubmissionComplete(true);

      // Poll for grading completion
      const pollResult = await pollJob(data.jobId);
      if (pollResult.state !== 'completed') {
        throw new Error(pollResult.error || 'Grading did not complete');
      }
      if (!isMountedRef.current) return;
      setIsSubmitting(false);
      router.refresh();
    } catch (error) {
      console.error('Error submitting exam:', error);
      setError('Failed to submit exam. Please try again.');
      setIsSubmitting(false);
    }
  };

  const errorBanner = error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (submissionComplete) {
    return (
      <div className="space-y-6">
        {errorBanner}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Exam Submitted!</CardTitle>
            <CardDescription>
              Your exam has been submitted and is being graded
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSubmitting ? (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Your exam is being graded by AI. This may take a minute...
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertDescription>
                  Your exam has been graded! View your results below.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setIsStarted(false);
                  setSubmissionComplete(false);
                  setJobId(null);
                }}
                variant="outline"
              >
                View Results
              </Button>
              <Button variant="back" size="back" onClick={() => router.push(`/projects/${exam.projectId}`)}>
                Back to Project
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isStarted) {
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
          durationMinutes={exam.durationMinutes}
          onSubmit={handleSubmitExam}
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
        description="Timed exam session with autosave-style submission and AI grading."
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
              begin counting down. Make sure you have a stable internet connection and enough time
              to complete the exam. Your answers will be automatically submitted when time runs out.
            </AlertDescription>
          </Alert>

          <Button onClick={handleStartExam} size="lg" className="w-full">
            <Play className="mr-2 h-5 w-5" />
            Start Exam
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <ExamHistory examId={exam.id} />
    </div>
  );
}
