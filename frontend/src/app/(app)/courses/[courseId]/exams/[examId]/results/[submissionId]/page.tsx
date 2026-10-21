import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shell/slots'
import { ComingSoon } from '@/features/courses/coming-soon'
import { examCrumbs } from '@/features/courses/exam-crumbs'
import { getCourseShell } from '@/server/queries/courses'
import { getExamBasics } from '@/server/queries/exams'
import { requireUser } from '@/server/session'

export const metadata = { title: 'Exam results' }

type Params = Promise<{ courseId: string; examId: string; submissionId: string }>

export default async function ExamResultsPage({ params }: { params: Params }) {
  const user = await requireUser()
  const { courseId, examId } = await params
  const [course, exam] = await Promise.all([getCourseShell(user.id, courseId), getExamBasics(user.id, courseId, examId)])
  if (!course || !exam) notFound()
  return (
    <>
      <PageHeader crumbs={examCrumbs(course, exam, 'Results')} />
      <ComingSoon title="Results" description={exam.name} />
    </>
  )
}
