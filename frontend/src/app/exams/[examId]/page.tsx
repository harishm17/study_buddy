import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ExamPageClient from '@/components/exams/exam-page-client';
import { PageShell } from '@/components/ui/page-shell';

interface ExamPageProps {
  params: Promise<{
    examId: string;
  }>;
}

const toQuestionArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'object' && item !== null)
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

  return (
    <PageShell className="max-w-6xl">
      <Suspense fallback={<div>Loading exam...</div>}>
        <ExamPageClient
          exam={{
            id: exam.id,
            name: exam.name,
            projectId: exam.project.id,
            projectName: exam.project.name,
            questions: toQuestionArray(exam.questions),
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
