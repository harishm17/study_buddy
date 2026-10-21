import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shell/slots'
import { ComingSoon } from '@/features/courses/coming-soon'
import { examCrumbs } from '@/features/courses/exam-crumbs'
import { getCourseShell } from '@/server/queries/courses'
import { getExamBasics } from '@/server/queries/exams'
import { requireUser } from '@/server/session'

type Params = Promise<{ courseId: string; examId: string }>

export async function generateMetadata({ params }: { params: Params }) {
  const user = await requireUser()
  const { courseId, examId } = await params
  return { title: (await getExamBasics(user.id, courseId, examId))?.name ?? 'Mock exam' }
}

export default async function ExamLobbyPage({ params }: { params: Params }) {
  const user = await requireUser()
  const { courseId, examId } = await params
  const [course, exam] = await Promise.all([getCourseShell(user.id, courseId), getExamBasics(user.id, courseId, examId)])
  if (!course || !exam) notFound()
  return (
    <>
      <PageHeader crumbs={examCrumbs(course, exam)} />
      <ComingSoon title={exam.name} description="Start or resume this mock exam." />
    </>
  )
}
