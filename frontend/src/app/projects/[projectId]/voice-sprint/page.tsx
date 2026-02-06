import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth/get-session'
import { prisma } from '@/lib/db/prisma'
import { VoiceCoach } from '@/components/voice/VoiceCoach'
import { PageHeader, PageShell } from '@/components/ui/page-shell'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface VoiceSprintPageProps {
  params: Promise<{ projectId: string }>
}

export default async function VoiceSprintPage({ params }: VoiceSprintPageProps) {
  const session = await requireAuth()
  const { projectId } = await params

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    select: {
      id: true,
      name: true,
    },
  })

  if (!project) {
    notFound()
  }

  return (
    <PageShell className="max-w-5xl space-y-6">
      <PageHeader
        eyebrow={project.name}
        title="Voice Sprint"
        description="Rapid conceptual review across your weakest areas with interruption-safe live coaching."
        actions={
          <Link href={`/projects/${project.id}`}>
            <Button variant="back" size="back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Project
            </Button>
          </Link>
        }
      />
      <VoiceCoach mode="sprint" projectId={project.id} title="Voice Sprint" />
    </PageShell>
  )
}
