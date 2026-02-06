import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { TopicReview } from '@/components/topics/topic-review'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ui/page-shell'

interface TopicReviewPageProps {
  params: Promise<{
    projectId: string
  }>
}

export default async function TopicReviewPage({ params }: TopicReviewPageProps) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login')
  }

  const { projectId } = await params

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  })

  if (!project) {
    redirect('/dashboard')
  }

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        eyebrow="Topics"
        title="Review and Confirm Topics"
        description={`Refine extracted topics for ${project.name} before generating study content.`}
        actions={
          <Link href={`/projects/${projectId}`}>
            <Button variant="back" size="back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Project
            </Button>
          </Link>
        }
      />
      <TopicReview projectId={projectId} />
    </PageShell>
  )
}
