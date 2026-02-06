import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { MaterialUpload } from '@/components/materials/material-upload';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, PageShell } from '@/components/ui/page-shell';

interface UploadPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function UploadPage({ params }: UploadPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
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
    <PageShell className="max-w-5xl">
      <PageHeader
        eyebrow="Materials"
        title="Upload Study Materials"
        description={`Add study files for ${project.name} (PDF, DOCX, PPTX, DOC). Files are validated and queued for processing automatically.`}
        actions={
          <Link href={`/projects/${projectId}`}>
            <Button variant="back" size="back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Project
            </Button>
          </Link>
        }
      />
      <Suspense fallback={<div>Loading upload form...</div>}>
        <MaterialUpload
          projectId={projectId}
        />
      </Suspense>
    </PageShell>
  );
}
