'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Loader2, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Question {
  question_type: 'multiple_choice' | 'short_answer' | 'numerical' | 'true_false';
  question_text: string;
  topic_id?: string;
  topic_name?: string;
  points?: number;
  difficulty?: string;
  // Multiple choice fields
  options?: Array<{ id: string; text: string }>;
  // Short answer fields
  key_points?: string[];
  // Numerical fields
  unit?: string;
}

interface ExamInterfaceProps {
  examId: string;
  examName: string;
  questions: Question[];
  durationMinutes: number;
  onSubmit: (answers: Record<string, any>) => void;
  isSubmitting?: boolean;
}

export default function ExamInterface({
  examId,
  examName,
  questions,
  durationMinutes,
  onSubmit,
  isSubmitting = false,
}: ExamInterfaceProps) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(durationMinutes * 60); // in seconds
  const [isTimerActive, setIsTimerActive] = useState(true);
  const [showWarning, setShowWarning] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (!isTimerActive || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsTimerActive(false);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerActive, timeRemaining]);

  // Show warning when 5 minutes left
  useEffect(() => {
    if (timeRemaining === 300 && timeRemaining > 0) {
      setShowWarning(true);
    }
  }, [timeRemaining]);

  const handleAutoSubmit = useCallback(() => {
    onSubmit(answers);
  }, [answers, onSubmit]);

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
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / questions.length) * 100;

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

  const handleSubmitExam = () => {
    if (answeredCount < questions.length) {
      const unanswered = questions.length - answeredCount;
      if (!confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) {
        return;
      }
    }
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
                <span className={`text-2xl font-mono font-bold ${timeRemaining < 300 ? 'text-red-500' : ''}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {answeredCount} of {questions.length} answered
              </div>
            </div>
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
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Warning for low time */}
      {showWarning && timeRemaining > 0 && timeRemaining < 300 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Only 5 minutes remaining! Your exam will auto-submit when time runs out.
          </AlertDescription>
        </Alert>
      )}

      {/* Question Card */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-base font-normal text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </CardTitle>
              {currentQuestion.topic_name && (
                <div className="text-sm text-muted-foreground mt-1">
                  Topic: {currentQuestion.topic_name}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              {currentQuestion.points && (
                <span className="text-muted-foreground">{currentQuestion.points} pts</span>
              )}
              {answers[currentQuestionIndex] !== undefined && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
          <CardDescription className="text-lg font-medium text-foreground mt-4">
            {currentQuestion.question_text}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentQuestion.question_type === 'multiple_choice' && (
            <RadioGroup
              value={answers[currentQuestionIndex] || ''}
              onValueChange={(value) => handleAnswerChange(currentQuestionIndex, value)}
            >
              <div className="space-y-3">
                {currentQuestion.options?.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-start space-x-3 p-4 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <RadioGroupItem value={option.id} id={option.id} />
                    <label
                      htmlFor={option.id}
                      className="flex-1 text-sm cursor-pointer"
                    >
                      <span className="font-medium">{option.id}.</span> {option.text}
                    </label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          )}

          {currentQuestion.question_type === 'short_answer' && (
            <div className="space-y-2">
              <Label htmlFor="answer">Your Answer</Label>
              <textarea
                id="answer"
                className="w-full min-h-[150px] p-3 rounded-md border bg-background"
                placeholder="Type your answer here..."
                value={answers[currentQuestionIndex] || ''}
                onChange={(e) => handleAnswerChange(currentQuestionIndex, e.target.value)}
              />
              {currentQuestion.key_points && currentQuestion.key_points.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Hint: Make sure to address key concepts in your answer
                </p>
              )}
            </div>
          )}

          {currentQuestion.question_type === 'numerical' && (
            <div className="space-y-2">
              <Label htmlFor="answer">Your Answer</Label>
              <div className="flex gap-2">
                <Input
                  id="answer"
                  type="number"
                  step="any"
                  placeholder="Enter numerical answer"
                  value={answers[currentQuestionIndex] || ''}
                  onChange={(e) => handleAnswerChange(currentQuestionIndex, parseFloat(e.target.value))}
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

          {currentQuestion.question_type === 'true_false' && (
            <RadioGroup
              value={answers[currentQuestionIndex]?.toString() || ''}
              onValueChange={(value) => handleAnswerChange(currentQuestionIndex, value === 'true')}
            >
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-4 rounded-lg border hover:bg-accent transition-colors">
                  <RadioGroupItem value="true" id="true" />
                  <label htmlFor="true" className="flex-1 text-sm cursor-pointer">
                    True
                  </label>
                </div>
                <div className="flex items-center space-x-3 p-4 rounded-lg border hover:bg-accent transition-colors">
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

        {/* Question Navigator */}
        <div className="flex flex-wrap gap-2 max-w-md justify-center">
          {questions.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentQuestionIndex(index)}
              className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                index === currentQuestionIndex
                  ? 'bg-primary text-primary-foreground'
                  : answers[index] !== undefined
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-muted hover:bg-accent'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>

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
