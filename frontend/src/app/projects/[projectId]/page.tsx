import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ProjectDashboard from '@/components/projects/project-dashboard';
import { PageShell } from '@/components/ui/page-shell';

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
    topic?: string;
  }>;
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const { projectId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedTab = resolvedSearchParams?.tab;
  const initialTab =
    requestedTab === 'materials' ||
    requestedTab === 'topics' ||
    requestedTab === 'exams' ||
    requestedTab === 'ask'
      ? requestedTab
      : undefined;

  // Only the columns the page shows. In particular, no exam questions: they are large and
  // only the exam page needs them.
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      createdAt: true,
      materials: {
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          filename: true,
          category: true,
          validationStatus: true,
          validationNotes: true,
          sizeBytes: true,
          uploadedAt: true,
        },
      },
      topics: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          orderIndex: true,
          userConfirmed: true,
          progress: {
            where: { userId: session.user.id },
            select: {
              notesCompleted: true,
              examplesCompleted: true,
              quizCompleted: true,
              quizScore: true,
            },
          },
          _count: {
            select: { content: true },
          },
        },
      },
      sampleExams: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          difficultyLevel: true,
          topicsCovered: true,
          createdAt: true,
          _count: {
            select: { submissions: true },
          },
        },
      },
    },
  });

  if (!project) {
    redirect('/dashboard');
  }

  return (
    <PageShell>
      <Suspense fallback={<div>Loading project...</div>}>
        <ProjectDashboard
          initialTab={initialTab}
          initialTopicId={resolvedSearchParams?.topic}
          project={{
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
            createdAt: project.createdAt.toISOString(),
            materials: project.materials.map((m) => ({
              id: m.id,
              filename: m.filename,
              category: m.category,
              validationStatus: m.validationStatus,
              validationNotes: m.validationNotes,
              sizeBytes: m.sizeBytes.toString(),
              uploadedAt: m.uploadedAt.toISOString(),
            })),
            topics: project.topics.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              orderIndex: t.orderIndex,
              userConfirmed: t.userConfirmed,
              contentCount: t._count.content,
              progress: t.progress[0]
                ? {
                    notesCompleted: t.progress[0].notesCompleted,
                    examplesCompleted: t.progress[0].examplesCompleted,
                    quizCompleted: t.progress[0].quizCompleted,
                    quizScore: t.progress[0].quizScore,
                  }
                : null,
            })),
            exams: project.sampleExams.map((e) => ({
              id: e.id,
              name: e.name,
              durationMinutes: e.durationMinutes,
              difficultyLevel: e.difficultyLevel,
              topicsCovered: e.topicsCovered,
              createdAt: e.createdAt.toISOString(),
              submissionsCount: e._count.submissions,
            })),
          }}
        />
      </Suspense>
    </PageShell>
  );
}
