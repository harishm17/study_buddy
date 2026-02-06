import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ExamGenerationPage from '@/components/exams/exam-generation-page';
import { PageShell } from '@/components/ui/page-shell';

interface GenerateExamPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function GenerateExamPage({ params }: GenerateExamPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const { projectId } = await params;

  // Fetch project with topics
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    include: {
      topics: {
        where: { userConfirmed: true },
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  });

  if (!project) {
    redirect('/dashboard');
  }

  if (project.topics.length === 0) {
    redirect(`/projects/${projectId}`);
  }

  return (
    <PageShell className="max-w-5xl">
      <Suspense fallback={<div>Loading...</div>}>
        <ExamGenerationPage
          projectId={project.id}
          projectName={project.name}
          topics={project.topics}
        />
      </Suspense>
    </PageShell>
  );
}
