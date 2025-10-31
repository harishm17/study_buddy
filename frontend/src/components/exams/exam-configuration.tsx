'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileText, Clock, BarChart3 } from 'lucide-react';

interface Topic {
  id: string;
  name: string;
  description?: string;
}

interface ExamConfigurationProps {
  projectId: string;
  topics: Topic[];
  onExamCreated: (jobId: string) => void;
}

export default function ExamConfiguration({
  projectId,
  topics,
  onExamCreated,
}: ExamConfigurationProps) {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [totalQuestions, setTotalQuestions] = useState(20);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [difficultyLevel, setDifficultyLevel] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTopicToggle = (topicId: string) => {
    const newSelection = new Set(selectedTopics);
    if (newSelection.has(topicId)) {
      newSelection.delete(topicId);
    } else {
      newSelection.add(topicId);
    }
    setSelectedTopics(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedTopics.size === topics.length) {
      setSelectedTopics(new Set());
    } else {
      setSelectedTopics(new Set(topics.map((t) => t.id)));
    }
  };

  const handleGenerateExam = async () => {
    if (selectedTopics.size === 0) {
      setError('Please select at least one topic');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/generate-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicIds: Array.from(selectedTopics),
          totalQuestions,
          durationMinutes,
          difficultyLevel,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate exam');
      }

      const data = await response.json();
      onExamCreated(data.jobId);
    } catch (err: any) {
      console.error('Error generating exam:', err);
      setError(err.message || 'Failed to generate exam');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Topic Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Topics</CardTitle>
          <CardDescription>
            Choose the topics you want to include in your exam
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center pb-2 border-b">
            <span className="text-sm text-muted-foreground">
              {selectedTopics.size} of {topics.length} selected
            </span>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedTopics.size === topics.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {topics.map((topic) => (
              <div
                key={topic.id}
                className="flex items-start space-x-3 p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <Checkbox
                  id={topic.id}
                  checked={selectedTopics.has(topic.id)}
                  onCheckedChange={() => handleTopicToggle(topic.id)}
                />
                <div className="flex-1">
                  <label
                    htmlFor={topic.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {topic.name}
                  </label>
                  {topic.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {topic.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exam Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Exam Settings</CardTitle>
          <CardDescription>
            Configure the parameters for your sample exam
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Number of Questions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Number of Questions
              </Label>
              <span className="text-sm font-medium">{totalQuestions}</span>
            </div>
            <Slider
              value={[totalQuestions]}
              onValueChange={(value) => setTotalQuestions(value[0])}
              min={5}
              max={50}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Select between 5 and 50 questions
            </p>
          </div>

          {/* Duration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Duration (minutes)
              </Label>
              <span className="text-sm font-medium">{durationMinutes}</span>
            </div>
            <Slider
              value={[durationMinutes]}
              onValueChange={(value) => setDurationMinutes(value[0])}
              min={15}
              max={180}
              step={15}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Exam duration from 15 minutes to 3 hours
            </p>
          </div>

          {/* Difficulty Level */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Difficulty Level
            </Label>
            <RadioGroup
              value={difficultyLevel}
              onValueChange={(value) => setDifficultyLevel(value as any)}
            >
              <div className="flex items-center space-x-2 p-3 rounded-lg border">
                <RadioGroupItem value="easy" id="easy" />
                <div className="flex-1">
                  <label
                    htmlFor="easy"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Easy
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Straightforward questions testing basic understanding
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 p-3 rounded-lg border">
                <RadioGroupItem value="medium" id="medium" />
                <div className="flex-1">
                  <label
                    htmlFor="medium"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Medium
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Moderately challenging questions requiring application
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 p-3 rounded-lg border">
                <RadioGroupItem value="hard" id="hard" />
                <div className="flex-1">
                  <label
                    htmlFor="hard"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Hard
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Complex questions requiring deep understanding and synthesis
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Generate Button */}
      <Button
        onClick={handleGenerateExam}
        disabled={isGenerating || selectedTopics.size === 0}
        size="lg"
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating Exam...
          </>
        ) : (
          'Generate Sample Exam'
        )}
      </Button>

      {isGenerating && (
        <Alert>
          <AlertDescription>
            Your exam is being generated. This may take a minute...
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
