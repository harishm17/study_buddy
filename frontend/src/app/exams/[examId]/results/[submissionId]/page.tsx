import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ExamResults from '@/components/exams/exam-results';
import { PageShell } from '@/components/ui/page-shell';

interface ExamResultsPageProps {
  params: Promise<{
    examId: string;
    submissionId: string;
  }>;
}

export default async function ExamResultsPage({ params }: ExamResultsPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const { examId, submissionId } = await params;

  // Ownership check only; the results themselves load through the API, which also follows
  // grading while it runs.
  const submission = await prisma.examSubmission.findFirst({
    where: {
      id: submissionId,
      sampleExamId: examId,
      userId: session.user.id,
      status: 'submitted',
    },
    select: {
      sampleExam: {
        select: { name: true, project: { select: { id: true, name: true } } },
      },
    },
  });

  if (!submission) {
    redirect(`/exams/${examId}`);
  }

  return (
    <PageShell className="max-w-4xl">
      <ExamResults
        examId={examId}
        submissionId={submissionId}
        examName={submission.sampleExam.name}
        projectId={submission.sampleExam.project.id}
        projectName={submission.sampleExam.project.name}
      />
    </PageShell>
  );
}
