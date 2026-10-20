'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loader2, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { MarkdownBlock, MarkdownInline } from '@/components/ui/markdown';
import { formatLearningMarkdown } from '@/lib/utils/learning-markdown';
import { useExamAutosave, type SaveStatus } from '@/hooks/useExamAutosave';

interface Question {
  question_type: 'multiple_choice' | 'short_answer' | 'numerical' | 'true_false';
  question_text: string;
  topic_id?: string;
  topic_name?: string;
  points?: number;
  difficulty?: string;
  // Multiple choice fields
  options?: Array<{ id: string; text: string }>;
  // Numerical fields
  unit?: string;
}

interface ExamInterfaceProps {
  examId: string;
  examName: string;
  questions: Question[];
  /** When time runs out, as a client-clock timestamp (the server start time plus the duration). */
  deadlineAtMs: number;
  /** Answers already saved on the server, when an attempt is resumed. */
  initialAnswers?: Record<string, any>;
  onSubmit: (answers: Record<string, any>) => void;
  /** The server closed the attempt (time ran out or it was submitted elsewhere). */
  onEnded: (submissionId: string | null) => void;
  isSubmitting?: boolean;
}

const secondsLeft = (deadlineAtMs: number) =>
  Math.max(0, Math.ceil((deadlineAtMs - Date.now()) / 1000));

const saveStatusText = (status: SaveStatus, lastSavedAt: Date | null) => {
  if (status === 'saving') return 'Saving your answers...';
  if (status === 'error') return 'Could not save your answers. Trying again...';
  if (status === 'saved' && lastSavedAt) {
    return `Answers saved at ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  }
  return 'Your answers are saved automatically.';
};

export default function ExamInterface({
  examId,
  examName,
  questions,
  deadlineAtMs,
  initialAnswers,
  onSubmit,
  onEnded,
  isSubmitting = false,
}: ExamInterfaceProps) {
  const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers ?? {});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(() => secondsLeft(deadlineAtMs));
  const answersRef = useRef<Record<string, any>>(answers);
  const autoSubmittedRef = useRef(false);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    answersRef.current = answers;
    onSubmitRef.current = onSubmit;
  });

  const { status: saveStatus, lastSavedAt } = useExamAutosave({
    examId,
    answers,
    savedAnswers: initialAnswers ?? {},
    enabled: !isSubmitting,
    onEnded,
  });

  // The countdown is read from the clock against the server-set deadline on every tick, so a
  // throttled background tab catches up as soon as it wakes. At zero the saved answers are
  // submitted once.
  useEffect(() => {
    const tick = () => {
      const left = secondsLeft(deadlineAtMs);
      setTimeRemaining(left);
      if (left <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        onSubmitRef.current(answersRef.current);
      }
    };
    const interval = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [deadlineAtMs]);


  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionIndex: number, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionIndex]: value,
    }));
  };

  const currentQuestion = questions[currentQuestionIndex];
  const hasAnswer = (value: any) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return !Number.isNaN(value);
    return true;
  };
  const totalQuestions = questions.length;
  const answeredCount = Object.values(answers).filter(hasAnswer).length;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  if (totalQuestions === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{examName}</CardTitle>
          <CardDescription>No questions are available for this exam.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const unansweredCount = questions.length - answeredCount;

  const handleSubmitExam = () => {
    onSubmit(answers);
  };

  return (
    <div className="space-y-6">
      {/* Timer and Progress Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className={`h-5 w-5 ${timeRemaining < 300 ? 'text-red-500' : ''}`} />
                <span className={`text-2xl font-mono-ui font-bold ${timeRemaining < 300 ? 'text-red-500' : ''}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {answeredCount} of {totalQuestions} answered
              </div>
            </div>
            {unansweredCount > 0 ? (
              <ConfirmDialog
                title="Submit with unanswered questions?"
                description={`You still have ${unansweredCount} unanswered question(s). Submit anyway?`}
                confirmLabel="Submit Anyway"
                onConfirm={handleSubmitExam}
                disabled={isSubmitting}
                trigger={
                  <Button disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Exam'
                    )}
                  </Button>
                }
              />
            ) : (
              <Button onClick={handleSubmitExam} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Exam'
                )}
              </Button>
            )}
          </div>
          <Progress value={progress} className="h-2" />
          <p role="status" aria-live="polite" className="mt-3 text-xs text-muted-foreground">
            {saveStatusText(saveStatus, lastSavedAt)}
          </p>
        </CardContent>
      </Card>

      {/* Warning for low time */}
      {timeRemaining > 0 && timeRemaining <= 300 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Only 5 minutes remaining! Your exam will auto-submit when time runs out.
          </AlertDescription>
        </Alert>
      )}

      {/* Question Card */}
      <Card className="border-primary/25">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-base font-normal text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </CardTitle>
              {currentQuestion?.topic_name && (
                <div className="text-sm text-muted-foreground mt-1">
                  Topic: {currentQuestion?.topic_name}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              {currentQuestion?.points && (
                <span className="text-muted-foreground">{currentQuestion.points} pts</span>
              )}
              {hasAnswer(answers[currentQuestionIndex]) && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
          <div className="text-lg font-medium text-foreground mt-4">
            <MarkdownBlock
              content={formatLearningMarkdown(currentQuestion?.question_text || 'No questions available yet.')}
              variant="compact"
            />
          </div>
        </CardHeader>
        <CardContent>
          {currentQuestion?.question_type === 'multiple_choice' && (
            <RadioGroup
              value={answers[currentQuestionIndex] || ''}
              onValueChange={(value) => handleAnswerChange(currentQuestionIndex, value)}
            >
              <div className="space-y-3">
                {currentQuestion.options?.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-start space-x-3 rounded-xl border border-border/70 bg-white/75 p-4 transition hover:border-primary/30 hover:bg-white"
                  >
                    <RadioGroupItem value={option.id} id={option.id} />
                    <label
                      htmlFor={option.id}
                      className="flex-1 text-sm cursor-pointer"
                    >
                      <span className="font-medium">{option.id}.</span>{' '}
                      <MarkdownInline content={option.text} />
                    </label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          )}

          {currentQuestion?.question_type === 'short_answer' && (
            <div className="space-y-2">
              <Label htmlFor="answer">Your Answer</Label>
              <textarea
                id="answer"
                className="w-full min-h-[150px] p-3 rounded-md border bg-background"
                placeholder="Type your answer here..."
                value={answers[currentQuestionIndex] || ''}
                onChange={(e) => handleAnswerChange(currentQuestionIndex, e.target.value)}
              />
            </div>
          )}

          {currentQuestion?.question_type === 'numerical' && (
            <div className="space-y-2">
              <Label htmlFor="answer">Your Answer</Label>
              <div className="flex gap-2">
                <Input
                  id="answer"
                  type="number"
                  step="any"
                  placeholder="Enter numerical answer"
                  value={answers[currentQuestionIndex] ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value
                    handleAnswerChange(currentQuestionIndex, raw === '' ? '' : parseFloat(raw))
                  }}
                  className="flex-1"
                />
                {currentQuestion.unit && (
                <div className="flex items-center px-3 border rounded-md bg-muted">
                  <span className="text-sm">{currentQuestion.unit}</span>
                </div>
                )}
              </div>
            </div>
          )}

          {currentQuestion?.question_type === 'true_false' && (
            <RadioGroup
              value={answers[currentQuestionIndex]?.toString() || ''}
              onValueChange={(value) => handleAnswerChange(currentQuestionIndex, value === 'true')}
            >
              <div className="space-y-3">
                <div className="flex items-center space-x-3 rounded-xl border border-border/70 bg-white/75 p-4 transition hover:border-primary/30 hover:bg-white">
                  <RadioGroupItem value="true" id="true" />
                  <label htmlFor="true" className="flex-1 text-sm cursor-pointer">
                    True
                  </label>
                </div>
                <div className="flex items-center space-x-3 rounded-xl border border-border/70 bg-white/75 p-4 transition hover:border-primary/30 hover:bg-white">
                  <RadioGroupItem value="false" id="false" />
                  <label htmlFor="false" className="flex-1 text-sm cursor-pointer">
                    False
                  </label>
                </div>
              </div>
            </RadioGroup>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
        >
          Previous
        </Button>

        {/* Question Navigator. Answered questions show a check mark as well as a colour. */}
        <nav aria-label="Question navigator" className="flex flex-col items-center gap-2">
          <ol className="flex max-w-md list-none flex-wrap justify-center gap-2 p-0">
            {questions.map((_, index) => {
              const answered = hasAnswer(answers[index]);
              const current = index === currentQuestionIndex;
              return (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => setCurrentQuestionIndex(index)}
                    aria-current={current ? 'step' : undefined}
                    aria-label={`Question ${index + 1}, ${answered ? 'answered' : 'not answered'}${current ? ', current' : ''}`}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                      current
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                        : answered
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : 'bg-muted border border-dashed border-border hover:bg-accent'
                    }`}
                  >
                    {index + 1}
                    {answered && (
                      <CheckCircle2
                        aria-hidden="true"
                        className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-white text-green-700"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground">
            Check mark: answered. Dashed outline: not answered yet.
          </p>
        </nav>

        <Button
          onClick={handleNext}
          disabled={currentQuestionIndex === questions.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
