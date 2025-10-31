import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Dashboard from '@/components/dashboard/dashboard';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  // Fetch user's projects with stats
  const projects = await prisma.project.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      _count: {
        select: {
          materials: true,
          topics: true,
          sampleExams: true,
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <Suspense fallback={<div>Loading dashboard...</div>}>
        <Dashboard
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            status: p.status,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
            materialsCount: p._count.materials,
            topicsCount: p._count.topics,
            examsCount: p._count.sampleExams,
          }))}
          user={{
            name: session.user.name || 'User',
            email: session.user.email || '',
          }}
        />
      </Suspense>
    </div>
  );
}
