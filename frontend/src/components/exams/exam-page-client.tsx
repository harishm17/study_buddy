'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import ExamInterface from './exam-interface';
import ExamHistory from './exam-history';
import { ArrowLeft, Clock, BarChart3, BookOpen, Play, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Exam {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  questions: any[];
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

  const handleStartExam = () => {
    setIsStarted(true);
  };

  const handleSubmitExam = async (answers: Record<string, any>) => {
    setIsSubmitting(true);

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
      pollGradingStatus(data.jobId);
    } catch (error) {
      console.error('Error submitting exam:', error);
      alert('Failed to submit exam. Please try again.');
      setIsSubmitting(false);
    }
  };

  const pollGradingStatus = async (gradingJobId: string) => {
    const maxAttempts = 60; // 5 minutes
    let attempts = 0;

    const poll = setInterval(async () => {
      attempts++;

      try {
        const response = await fetch(`/api/jobs/${gradingJobId}`);
        const job = await response.json();

        if (job.status === 'completed') {
          clearInterval(poll);
          setIsSubmitting(false);
          // Refresh the page to show updated history
          router.refresh();
        } else if (job.status === 'failed' || attempts >= maxAttempts) {
          clearInterval(poll);
          setIsSubmitting(false);
          alert('Grading is taking longer than expected. Please check back later.');
        }
      } catch (error) {
        console.error('Error polling job:', error);
      }
    }, 5000); // Poll every 5 seconds
  };

  if (submissionComplete) {
    return (
      <div className="space-y-6">
        <Card>
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
              <Button onClick={() => router.push(`/projects/${exam.projectId}`)}>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{exam.name}</h1>
            <p className="text-muted-foreground">
              {exam.projectName} • {exam.questions.length} questions
            </p>
          </div>
        </div>

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
      <div className="flex items-center gap-4">
        <Link href={`/projects/${exam.projectId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
        </Link>
      </div>

      {/* Exam Info */}
      <Card>
        <CardHeader>
          <CardTitle>{exam.name}</CardTitle>
          <CardDescription>{exam.projectName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
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
