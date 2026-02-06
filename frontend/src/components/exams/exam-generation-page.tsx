'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExamConfiguration from './exam-configuration';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-shell';

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
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
      }
    };
  }, []);

  const handleExamCreated = async (jobId: string) => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    setIsGenerating(true);
    setError(null);

    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      if (!isMountedRef.current) return;
      attempts += 1;

      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }
        const job = await response.json();

        if (job.status === 'completed') {
          if (job.resultData?.exam_id) {
            router.push(`/exams/${job.resultData.exam_id}`);
          } else {
            router.push(`/projects/${projectId}`);
          }
          return;
        }

        if (job.status === 'failed' || attempts >= maxAttempts) {
          if (!isMountedRef.current) return;
          setIsGenerating(false);
          setError('Exam generation failed or took too long. Please try again.');
          return;
        }
      } catch (pollError) {
        console.error('Error polling job:', pollError);
      }

      if (!isMountedRef.current) return;
      pollRef.current = setTimeout(poll, 5000);
    };

    poll();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={projectName}
        title="Create Sample Exam"
        description="Select topics and exam constraints, then generate a timed practice exam with full grading support."
        actions={
          <Link href={`/projects/${projectId}`}>
            <Button variant="back" size="back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Project
            </Button>
          </Link>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Configuration */}
      <ExamConfiguration
        projectId={projectId}
        topics={topics}
        onExamCreated={handleExamCreated}
      />
    </div>
  );
}
