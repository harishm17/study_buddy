import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { MaterialUpload } from '@/components/materials/material-upload';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface UploadPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function UploadPage({ params }: UploadPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const { projectId } = await params;

  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!project) {
    redirect('/dashboard');
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Upload Study Materials</h1>
        <p className="text-muted-foreground mt-2">
          Upload PDF files for <strong>{project.name}</strong>
        </p>
      </div>

      <Suspense fallback={<div>Loading upload form...</div>}>
        <MaterialUpload
          projectId={projectId}
        />
      </Suspense>
    </div>
  );
}

