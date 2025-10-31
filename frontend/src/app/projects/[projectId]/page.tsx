import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ProjectDashboard from '@/components/projects/project-dashboard';

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const { projectId } = await params;

  // Fetch project with all related data
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    include: {
      materials: {
        orderBy: { uploadedAt: 'desc' },
      },
      topics: {
        orderBy: { orderIndex: 'asc' },
        include: {
          progress: {
            where: { userId: session.user.id },
          },
          _count: {
            select: { content: true },
          },
        },
      },
      sampleExams: {
        orderBy: { createdAt: 'desc' },
        include: {
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
    <div className="container mx-auto py-8 max-w-7xl">
      <Suspense fallback={<div>Loading project...</div>}>
        <ProjectDashboard
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
    </div>
  );
}
