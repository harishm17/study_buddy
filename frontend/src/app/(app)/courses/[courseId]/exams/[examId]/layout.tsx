import { notFound } from 'next/navigation'
import { getExamBasics } from '@/server/queries/exams'
import { requireUser } from '@/server/session'

/** Every page of one mock exam: the exam must be the signed-in user's, otherwise it is a real 404. */
export default async function ExamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ courseId: string; examId: string }>
}) {
  const user = await requireUser()
  const { courseId, examId } = await params
  if (!(await getExamBasics(user.id, courseId, examId))) notFound()
  return children
}
