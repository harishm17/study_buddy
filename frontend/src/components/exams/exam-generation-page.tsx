'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExamConfiguration from './exam-configuration';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-shell';
import { pollFailureMessage, useJobPolling } from '@/hooks/useJobPolling';

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
  const { pollJob, stopPolling, resumeActiveJobs } = useJobPolling({ timeoutMs: 300_000 });

  const followJob = useCallback(
    async (jobId: string) => {
      setIsGenerating(true);
      setError(null);

      const result = await pollJob(jobId);
      if (result.state === 'cancelled') return;

      if (result.state === 'completed') {
        const examId = result.job?.resultData?.exam_id;
        router.push(typeof examId === 'string' ? `/exams/${examId}` : `/projects/${projectId}`);
        return;
      }

      setIsGenerating(false);
      setError(
        pollFailureMessage(result, 'Exam generation failed. Please try again.')
      );
    },
    [pollJob, projectId, router]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // An exam still being generated before a refresh: follow it to the finished exam.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = await resumeActiveJobs({ projectId, jobTypes: ['generate_exam'] }).catch(() => []);
      if (cancelled || active.length === 0) return;
      await followJob(active[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [followJob, projectId, resumeActiveJobs]);

  const handleExamCreated = (jobId: string) => {
    void followJob(jobId);
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
