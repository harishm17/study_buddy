'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExamConfiguration from './exam-configuration';
import Link from 'next/link';

interface Topic {
  id: string;
  name: string;
  description: string | null;
}

interface ExamGenerationPageProps {
  projectId: string;
  projectName: string;
  topics: Topic[];
}

export default function ExamGenerationPage({
  projectId,
  projectName,
  topics,
}: ExamGenerationPageProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExamCreated = async (jobId: string) => {
    setIsGenerating(true);

    // Poll for job completion
    const maxAttempts = 60; // 5 minutes
    let attempts = 0;

    const poll = setInterval(async () => {
      attempts++;

      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = await response.json();

        if (job.status === 'completed') {
          clearInterval(poll);
          // Navigate to the exam page
          if (job.resultData?.exam_id) {
            router.push(`/exams/${job.resultData.exam_id}`);
          } else {
            router.push(`/projects/${projectId}`);
          }
        } else if (job.status === 'failed' || attempts >= maxAttempts) {
          clearInterval(poll);
          setIsGenerating(false);
          alert('Exam generation failed or took too long. Please try again.');
        }
      } catch (error) {
        console.error('Error polling job:', error);
      }
    }, 5000); // Poll every 5 seconds
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Create Sample Exam</h1>
        <p className="text-muted-foreground">{projectName}</p>
      </div>

      {/* Configuration */}
      <ExamConfiguration
        projectId={projectId}
        topics={topics as any}
        onExamCreated={handleExamCreated}
      />
    </div>
  );
}
