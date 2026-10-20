import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { loadAttemptState } from '@/lib/exams/attempts';
import { toPublicQuestions } from '@/lib/learning/quiz-questions';
import ExamPageClient from '@/components/exams/exam-page-client';
import { PageShell } from '@/components/ui/page-shell';

interface ExamPageProps {
  params: Promise<{
    examId: string;
  }>;
}

export default async function ExamPage({ params }: ExamPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const { examId } = await params;

  // Fetch exam with project verification
  const exam = await prisma.sampleExam.findFirst({
    where: {
      id: examId,
      project: {
        userId: session.user.id,
      },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!exam) {
    redirect('/dashboard');
  }

  // An attempt that ran out of time while the student was away is submitted as saved, and
  // the student lands on its results.
  const attempt = await loadAttemptState(
    session.user.id,
    { id: exam.id, projectId: exam.project.id, durationMinutes: exam.durationMinutes }
  );
  if (attempt.kind === 'finalized') {
    redirect(`/exams/${exam.id}/results/${attempt.submissionId}`);
  }

  return (
    <PageShell className="max-w-6xl">
      <Suspense fallback={<div>Loading exam...</div>}>
        <ExamPageClient
          initialAttempt={attempt.kind === 'active' ? attempt.attempt : null}
          exam={{
            id: exam.id,
            name: exam.name,
            projectId: exam.project.id,
            projectName: exam.project.name,
            // Answer keys stay on the server; they are released in the results after grading.
            questions: toPublicQuestions(exam.questions),
            durationMinutes: exam.durationMinutes,
            difficultyLevel: exam.difficultyLevel,
            topicsCovered: exam.topicsCovered,
            createdAt: exam.createdAt.toISOString(),
          }}
        />
      </Suspense>
    </PageShell>
  );
}
